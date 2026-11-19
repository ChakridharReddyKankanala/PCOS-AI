from app.services.llm_service import generate_fallback_insights

def generate_clinical_summary(analysis):
    c = analysis.get("combined", {})
    insights = analysis.get("ai_insights") or generate_fallback_insights(analysis)
    headline = insights.get("headline", "PCOS Risk Assessment Summary")
    summary = insights.get("summary", "")
    disclaimer = insights.get("medical_disclaimer", "For clinical decision support only.")
    
    pred = c.get('prediction', 'UNKNOWN')
    prob = c.get('probability')
    prob_str = f"{int(prob * 100)}%" if prob is not None else "N/A"
    
    return f"[{headline}]\nOutcome: {pred} (Confidence / Probability: {prob_str})\n\n{summary}\n\nDisclaimer: {disclaimer}"
