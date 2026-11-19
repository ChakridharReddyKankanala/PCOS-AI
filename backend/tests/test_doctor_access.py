import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request

from app.api.analysis import doctor_history, get_analysis
from app.api.users import (
    CarePlanInput,
    AccessRequestResponseInput,
    DoctorAccessRequestInput,
    PatientAccessRequestInput,
    doctor_dashboard_summary,
    get_doctor_care_plan,
    available_doctors,
    access_requests,
    request_doctor_access,
    request_patient_access,
    patient_authorized_doctors,
    patient_care_plans,
    respond_to_access_request,
    revoke_doctor_access,
    revoke_patient_access,
    save_doctor_care_plan,
)
from app.core.doctor_access import (
    doctor_patient_access,
    doctor_patient_ids,
    patient_doctor_ids,
)
from app.core.security import create_access_token
from app.db.mongo import MockDB


class DoctorAccessTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = MockDB()

    async def test_patient_requests_doctor_and_only_approval_grants_access(self):
        await self.db.users.insert_one({
            "_id": "doctor-1",
            "role": "doctor",
            "full_name": "Dr. Example",
            "credential_verified": False,
        })
        with patch("app.api.users.get_db", return_value=self.db):
            directory = await available_doctors(patient={"user_id": "patient-1"})
            self.assertEqual(directory[0]["doctor_id"], "doctor-1")
            self.assertFalse(directory[0]["credential_verified"])

            result = await request_doctor_access(
                PatientAccessRequestInput(doctor_id="doctor-1"),
                patient={"user_id": "patient-1"},
            )
            request_id = result["request_id"]
            repeated = await request_doctor_access(
                PatientAccessRequestInput(doctor_id="doctor-1"),
                patient={"user_id": "patient-1"},
            )
            self.assertEqual(repeated["request_id"], request_id)
            self.assertFalse(await doctor_patient_access(self.db, "doctor-1", "patient-1"))

            doctor_inbox = await access_requests(user={"user_id": "doctor-1", "role": "doctor"})
            self.assertEqual(len(doctor_inbox), 1)
            self.assertEqual(doctor_inbox[0]["patient_id"], "patient-1")
            self.assertEqual(doctor_inbox[0]["requested_by"], "patient")

            with self.assertRaises(HTTPException):
                await respond_to_access_request(
                    request_id,
                    AccessRequestResponseInput(action="accept"),
                    user={"user_id": "patient-1", "role": "patient"},
                )
            await respond_to_access_request(
                request_id,
                AccessRequestResponseInput(action="accept"),
                user={"user_id": "doctor-1", "role": "doctor"},
            )
            self.assertTrue(await doctor_patient_access(self.db, "doctor-1", "patient-1"))
            with self.assertRaises(HTTPException):
                await respond_to_access_request(
                    request_id,
                    AccessRequestResponseInput(action="accept"),
                    user={"user_id": "doctor-1", "role": "doctor"},
                )

    async def test_doctor_request_requires_patient_approval_and_hides_account_existence(self):
        await self.db.users.insert_one({
            "_id": "doctor-1",
            "role": "doctor",
            "full_name": "Dr. Example",
        })
        await self.db.users.insert_one({
            "_id": "patient-1",
            "role": "patient",
            "email": "patient@example.com",
            "full_name": "Patient One",
        })
        await self.db.users.insert_one({
            "_id": "patient-2",
            "role": "patient",
            "email": "patient2@example.com",
            "full_name": "Patient Two",
        })

        with patch("app.api.users.get_db", return_value=self.db):
            patient_request = await request_patient_access(
                DoctorAccessRequestInput(patient_email="patient@example.com"),
                doctor={"user_id": "doctor-1"},
            )
            unknown_patient_request = await request_patient_access(
                DoctorAccessRequestInput(patient_email="missing@example.com"),
                doctor={"user_id": "doctor-1"},
            )
            self.assertEqual(patient_request, unknown_patient_request)
            self.assertFalse(await doctor_patient_access(self.db, "doctor-1", "patient-1"))

            patient_inbox = await access_requests(user={"user_id": "patient-1", "role": "patient"})
            self.assertEqual(len(patient_inbox), 1)
            self.assertEqual(patient_inbox[0]["doctor_name"], "Dr. Example")
            await respond_to_access_request(
                patient_inbox[0]["request_id"],
                AccessRequestResponseInput(action="accept"),
                user={"user_id": "patient-1", "role": "patient"},
            )
            await request_patient_access(
                DoctorAccessRequestInput(patient_email="patient2@example.com"),
                doctor={"user_id": "doctor-1"},
            )
            second_patient_inbox = await access_requests(
                user={"user_id": "patient-2", "role": "patient"}
            )
            await respond_to_access_request(
                second_patient_inbox[0]["request_id"],
                AccessRequestResponseInput(action="decline"),
                user={"user_id": "patient-2", "role": "patient"},
            )

        self.assertTrue(await doctor_patient_access(self.db, "doctor-1", "patient-1"))
        self.assertFalse(await doctor_patient_access(self.db, "doctor-1", "patient-2"))

    async def test_doctor_history_only_contains_shared_patients(self):
        await self.db.patient_access.insert_one({
            "patient_id": "shared-patient",
            "doctor_id": "doctor-1",
            "used": True,
            "authorized_at": datetime.now(timezone.utc),
        })
        for patient_id in ("shared-patient", "unshared-patient"):
            await self.db.users.insert_one({
                "_id": patient_id,
                "full_name": patient_id,
            })
            await self.db.analyses.insert_one({
                "_id": f"analysis-{patient_id}",
                "patient_id": patient_id,
                "created_at": datetime.now(timezone.utc),
                "clinical": {},
                "ultrasound": {},
                "combined": {},
            })

        with patch("app.api.analysis.get_db", return_value=self.db):
            results = await doctor_history(user={"user_id": "doctor-1"})

        self.assertEqual([item["patient_id"] for item in results], ["shared-patient"])

    async def test_doctor_cannot_open_an_analysis_after_access_is_revoked(self):
        await self.db.users.insert_one({
            "_id": "doctor-1",
            "role": "doctor",
        })
        await self.db.analyses.insert_one({
            "_id": "analysis-1",
            "patient_id": "patient-1",
            "created_at": datetime.now(timezone.utc),
        })
        token = create_access_token("doctor-1", "doctor")
        request = Request({
            "type": "http",
            "headers": [(b"authorization", f"Bearer {token}".encode())],
        })

        with patch("app.api.analysis.get_db", return_value=self.db):
            with self.assertRaises(HTTPException) as denied:
                await get_analysis("analysis-1", request)
            self.assertEqual(denied.exception.status_code, 404)

            await self.db.patient_access.insert_one({
                "patient_id": "patient-1",
                "doctor_id": "doctor-1",
                "used": True,
            })
            self.assertEqual(
                (await get_analysis("analysis-1", request))["analysis_id"],
                "analysis-1",
            )
            await self.db.patient_access.update_many(
                {"doctor_id": "doctor-1", "patient_id": "patient-1"},
                {"$set": {"revoked_at": datetime.now(timezone.utc)}},
            )
            with self.assertRaises(HTTPException):
                await get_analysis("analysis-1", request)

    async def test_revocation_removes_patient_from_doctor_access(self):
        await self.db.patient_access.insert_one({
            "patient_id": "patient-1",
            "doctor_id": "doctor-1",
            "used": True,
            "authorized_at": datetime.now(timezone.utc),
        })

        with patch("app.api.users.get_db", return_value=self.db):
            await revoke_patient_access(
                "patient-1",
                doctor={"user_id": "doctor-1"},
            )

        self.assertFalse(await doctor_patient_access(self.db, "doctor-1", "patient-1"))
        self.assertEqual(await doctor_patient_ids(self.db, "doctor-1"), set())

    async def test_patient_can_revoke_one_doctor_without_affecting_another(self):
        for doctor_id in ("doctor-1", "doctor-2"):
            await self.db.patient_access.insert_one({
                "patient_id": "patient-1",
                "doctor_id": doctor_id,
                "used": True,
            })
            await self.db.users.insert_one({
                "_id": doctor_id,
                "full_name": doctor_id,
            })

        with patch("app.api.users.get_db", return_value=self.db):
            doctors = await patient_authorized_doctors(patient={"user_id": "patient-1"})
            self.assertEqual(len(doctors), 2)
            await revoke_doctor_access(
                "doctor-1",
                patient={"user_id": "patient-1"},
            )

        self.assertEqual(await patient_doctor_ids(self.db, "patient-1"), {"doctor-2"})
        self.assertFalse(await doctor_patient_access(self.db, "doctor-1", "patient-1"))

    async def test_care_plan_is_shared_with_patient_and_requires_active_access_for_doctor(self):
        await self.db.patient_access.insert_one({
            "patient_id": "patient-1",
            "doctor_id": "doctor-1",
            "used": True,
            "authorized_at": datetime.now(timezone.utc),
        })
        await self.db.users.insert_one({
            "_id": "doctor-1",
            "full_name": "Dr. Example",
        })
        data = CarePlanInput(
            clinician_note="Review the lab results at follow-up.",
            follow_up_date="2026-12-01",
            status="follow_up_scheduled",
        )

        with patch("app.api.users.get_db", return_value=self.db):
            saved = await save_doctor_care_plan(
                "patient-1",
                data,
                doctor={"user_id": "doctor-1"},
            )
            patient_view = await patient_care_plans(patient={"user_id": "patient-1"})
            self.assertEqual(saved["status"], "follow_up_scheduled")
            self.assertEqual(patient_view[0]["doctor_name"], "Dr. Example")
            self.assertEqual(patient_view[0]["clinician_note"], data.clinician_note)

            await revoke_patient_access(
                "patient-1",
                doctor={"user_id": "doctor-1"},
            )
            with self.assertRaises(HTTPException):
                await get_doctor_care_plan(
                    "patient-1",
                    doctor={"user_id": "doctor-1"},
                )
            patient_view = await patient_care_plans(patient={"user_id": "patient-1"})
            self.assertEqual(patient_view[0]["clinician_note"], data.clinician_note)

    async def test_dashboard_summary_counts_only_authorized_records_and_follow_ups(self):
        now = datetime.now(timezone.utc)
        today = now.date()
        await self.db.patient_access.insert_one({
            "patient_id": "patient-1",
            "doctor_id": "doctor-1",
            "used": True,
            "authorized_at": now,
        })
        await self.db.analyses.insert_one({
            "_id": "shared-analysis",
            "patient_id": "patient-1",
            "created_at": now,
            "combined": {"probability": 0.5},
        })
        await self.db.analyses.insert_one({
            "_id": "unshared-analysis",
            "patient_id": "patient-2",
            "created_at": now,
            "combined": {"probability": 0.5},
        })
        for patient_id, follow_up_date in (
            ("patient-1", (today + timedelta(days=2)).isoformat()),
            ("patient-2", (today - timedelta(days=1)).isoformat()),
        ):
            await self.db.care_plans.insert_one({
                "doctor_id": "doctor-1",
                "patient_id": patient_id,
                "status": "follow_up_scheduled",
                "follow_up_date": follow_up_date,
            })

        with patch("app.api.users.get_db", return_value=self.db):
            summary = await doctor_dashboard_summary(doctor={"user_id": "doctor-1"})

        self.assertEqual(summary["authorized_patients"], 1)
        self.assertEqual(summary["saved_screenings"], 1)
        self.assertEqual(summary["screenings_last_7_days"], 1)
        self.assertEqual(summary["near_display_threshold"], 1)
        self.assertEqual(summary["follow_ups_due_soon"], 1)
        self.assertEqual(summary["overdue_follow_ups"], 0)


if __name__ == "__main__":
    unittest.main()
