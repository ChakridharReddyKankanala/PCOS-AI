from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from uuid import uuid4

class MockCollection:
    def __init__(self, name):
        self.name = name
        self.store = []

    async def create_index(self, *args, **kwargs):
        pass

    async def drop_index(self, *args, **kwargs):
        pass

    async def index_information(self):
        return {}

    async def insert_one(self, doc):
        doc.setdefault("_id", str(uuid4()))
        self.store.append(doc)
        return type("InsertResult", (), {"inserted_id": doc.get("_id")})()

    async def delete_many(self, filter_doc):
        retained = [doc for doc in self.store if not all(doc.get(k) == v for k, v in filter_doc.items())]
        deleted_count = len(self.store) - len(retained)
        self.store = retained
        return type("DeleteResult", (), {"deleted_count": deleted_count})()

    async def update_one(self, filter_doc, update_doc, **kwargs):
        for doc in self.store:
            if self._matches(doc, filter_doc):
                for key, value in update_doc.get("$set", {}).items():
                    doc[key] = value
                for key, value in update_doc.get("$inc", {}).items():
                    doc[key] = doc.get(key, 0) + value
                for key in update_doc.get("$unset", {}).keys():
                    doc.pop(key, None)
                return type("UpdateResult", (), {"modified_count": 1})()
        if kwargs.get("upsert"):
            doc = {
                key: value
                for key, value in filter_doc.items()
                if not isinstance(value, dict)
            }
            doc["_id"] = str(uuid4())
            doc.update(update_doc.get("$set", {}))
            self.store.append(doc)
            return type(
                "UpdateResult",
                (),
                {"modified_count": 1, "upserted_id": doc["_id"]},
            )()
        return type("UpdateResult", (), {"modified_count": 0})()

    async def update_many(self, filter_doc, update_doc):
        modified = 0
        for doc in self.store:
            if self._matches(doc, filter_doc):
                for key, value in update_doc.get("$set", {}).items():
                    doc[key] = value
                for key, value in update_doc.get("$inc", {}).items():
                    doc[key] = doc.get(key, 0) + value
                for key in update_doc.get("$unset", {}).keys():
                    doc.pop(key, None)
                modified += 1
        return type("UpdateResult", (), {"modified_count": modified})()

    async def find_one(self, filter_doc):
        for doc in self.store:
            if self._matches(doc, filter_doc):
                return doc
        return None

    @staticmethod
    def _matches(doc, filter_doc):
        for key, value in filter_doc.items():
            actual = doc.get(key)
            if isinstance(value, dict):
                operators = {name for name in value if name.startswith("$")}
                if not operators:
                    if actual != value:
                        return False
                    continue
                if "$in" in value and actual not in value["$in"]:
                    return False
                if "$exists" in value and (key in doc) != value["$exists"]:
                    return False
                if "$gt" in value and (actual is None or actual <= value["$gt"]):
                    return False
                if operators - {"$in", "$exists", "$gt"}:
                    return False
            elif actual != value:
                return False
        return True

    def find(self, filter_doc=None):
        if filter_doc is None:
            filter_doc = {}
        results = [doc for doc in self.store if self._matches(doc, filter_doc)]
        class AsyncCursor:
            def __init__(self, items):
                self.items = items
            def sort(self, *args, **kwargs):
                return self
            async def to_list(self, length=None):
                return self.items[:length] if length else list(self.items)
            def __aiter__(self):
                self._iter = iter(self.items)
                return self
            async def __anext__(self):
                try:
                    return next(self._iter)
                except StopIteration:
                    raise StopAsyncIteration
        return AsyncCursor(results)

class MockDB:
    def __init__(self):
        self.collections = {}

    def __getattr__(self, name):
        if name not in self.collections:
            self.collections[name] = MockCollection(name)
        return self.collections[name]

    async def command(self, cmd, *args, **kwargs):
        return {"ok": 1}

mock_db_instance = MockDB()
client = None
db = mock_db_instance

async def connect_db():
    global client, db
    try:
        client = AsyncIOMotorClient(settings.MONGO_URI, serverSelectionTimeoutMS=2000)
        # Test connection ping
        await client.admin.command('ping')
        db = client[settings.DB_NAME]
        await db.users.create_index("email", unique=True)

        # Clean up any corrupt phone: null values from previous tests
        try:
            await db.users.update_many({"phone": None}, {"$unset": {"phone": ""}})
        except Exception:
            pass

        # Recreate phone index with partialFilterExpression to ignore missing/null phones
        try:
            indexes = await db.users.index_information()
            if "phone_1" in indexes:
                await db.users.drop_index("phone_1")
        except Exception:
            pass

        try:
            await db.users.create_index(
                "phone",
                unique=True,
                partialFilterExpression={"phone": {"$type": "string"}}
            )
        except Exception as e:
            print(f"[MongoDB] Could not create partial index for phone: {e}")

        await db.otp_challenges.create_index("expires_at", expireAfterSeconds=0)
        await db.analyses.create_index([("patient_id", 1), ("created_at", -1)])
        await db.reports.create_index([("patient_id", 1), ("created_at", -1)])
        await db.patient_access.create_index([("doctor_id", 1), ("used", 1), ("patient_id", 1)])
        await db.access_requests.create_index([("doctor_id", 1), ("status", 1), ("created_at", -1)])
        await db.access_requests.create_index([("patient_id", 1), ("status", 1), ("created_at", -1)])
        await db.care_plans.create_index(
            [("doctor_id", 1), ("patient_id", 1)],
            unique=True,
        )
        print("[MongoDB] Successfully connected to MongoDB.")
    except Exception as e:
        print(f"[MongoDB] Connection failed ({e}). Falling back to in-memory mock database.")
        db = mock_db_instance

async def close_db():
    global client
    if client:
        client.close()

def get_db():
    global db
    if db is None:
        return mock_db_instance
    return db
