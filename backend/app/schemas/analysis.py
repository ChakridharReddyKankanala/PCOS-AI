from pydantic import BaseModel


class ClinicalInput(BaseModel):

    # Basic patient information
    age: float | None = None
    weight: float | None = None
    height: float | None = None
    bmi: float | None = None
    blood_group: float | None = None

    # Vital signs
    pulse_rate: float | None = None
    respiratory_rate: float | None = None
    hb: float | None = None

    # Menstrual information
    cycle: str | None = None
    cycle_length: float | None = None
    irregular_cycles: bool | None = None

    # Marriage / pregnancy
    marriage_status_years: float | None = None
    pregnant: bool | None = None
    abortions: float | None = None

    # Hormonal / laboratory information
    beta_hcg_1: float | None = None
    beta_hcg_2: float | None = None
    fsh: float | None = None
    lh: float | None = None
    fsh_lh: float | None = None
    testosterone: float | None = None
    prolactin: float | None = None
    tsh: float | None = None
    amh: float | None = None
    vitamin_d3: float | None = None
    progesterone: float | None = None
    rbs: float | None = None

    # Body measurements
    hip: float | None = None
    waist: float | None = None
    waist_hip_ratio: float | None = None

    # PCOS symptoms / lifestyle
    weight_gain: bool | None = None
    hair_growth: bool | None = None
    skin_darkening: bool | None = None
    hair_loss: bool | None = None
    pimples: bool | None = None
    acne: bool | None = None
    fast_food: bool | None = None
    regular_exercise: bool | None = None

    # Blood pressure
    bp_systolic: float | None = None
    bp_diastolic: float | None = None

    # Ultrasound / follicle information
    follicle_no_left: float | None = None
    follicle_no_right: float | None = None
    average_follicle_size_left: float | None = None
    average_follicle_size_right: float | None = None
    endometrium: float | None = None