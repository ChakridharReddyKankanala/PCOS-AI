from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm

def generate_pdf(path, patient, analysis, summary):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(
        path,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )
    story = []
    story += [Paragraph("PCOS-XAI Clinical Analysis Report", styles["Title"]), Spacer(1, 10)]
    
    patient_data = [
        ["Patient Name", patient.get("full_name", "")],
        ["Patient ID", patient.get("user_id", "")],
        ["Email", patient.get("email", "")],
    ]
    t = Table(patient_data, colWidths=[45 * mm, 110 * mm])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (0, -1), colors.lightgrey),
    ]))
    story += [t, Spacer(1, 12)]

    for title, key in [
        ("Clinical Model Assessment", "clinical"),
        ("Ultrasound Model Assessment", "ultrasound"),
        ("Multimodal Fusion Result", "combined"),
    ]:
        val = analysis.get(key, {})
        story += [
            Paragraph(title, styles["Heading2"]),
            Paragraph(str(val), styles["BodyText"]),
            Spacer(1, 8),
        ]

    story += [
        Paragraph("AI-Generated Clinical Summary & Guidance", styles["Heading2"]),
        Paragraph(summary.replace("\n", "<br/>"), styles["BodyText"]),
        Spacer(1, 12),
        Paragraph(
            "Important: This AI-generated report is intended to support clinical assessment and should not be treated as a standalone medical diagnosis.",
            styles["Italic"],
        ),
    ]
    doc.build(story)
