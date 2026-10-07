from pathlib import Path

import streamlit as st


STYLE_DIR = Path(__file__).resolve().parent / "styles"


def load_css(theme: str = "light"):
    """Load the complete MedQuad AI design system."""

    if theme not in {"light", "dark"}:
        theme = "light"

    # ---------------------------------------------------------
    # THEME VARIABLES
    # ---------------------------------------------------------

    if theme == "dark":
        theme_variables = """
        :root {
            --background: #0B1220;

            --surface: #111C2F;
            --surface-secondary: #17243A;

            --primary: #2583F7;
            --primary-hover: #4598FF;
            --primary-soft: #152D50;

            --text-primary: #F2F7FF;
            --text-secondary: #B7C5DA;
            --text-muted: #8292AC;

            --border: #293B55;

            --shadow:
                0 8px 28px rgba(0, 0, 0, 0.24);
        }
        """

    else:
        theme_variables = """
        :root {
            --background: #F8FBFF;

            --surface: #FFFFFF;
            --surface-secondary: #F3F8FF;

            --primary: #086AF6;
            --primary-hover: #075BD5;
            --primary-soft: #EAF4FF;

            --text-primary: #09245E;
            --text-secondary: #4D6284;
            --text-muted: #7B8CA7;

            --border: #DCE8F6;

            --shadow:
                0 8px 28px rgba(22, 72, 140, 0.08);
        }
        """

    # ---------------------------------------------------------
    # LOAD STYLESHEETS
    # ---------------------------------------------------------

    css_files = [
        "main.css",
        "home.css",
        "auth.css",
        "chat.css",
    ]

    css_content = ""

    for filename in css_files:
        css_path = STYLE_DIR / filename

        if not css_path.exists():
            raise FileNotFoundError(
                f"CSS file not found: {css_path}"
            )

        css_content += "\n\n"
        css_content += css_path.read_text(
            encoding="utf-8"
        )

    # ---------------------------------------------------------
    # INJECT COMPLETE DESIGN SYSTEM
    # ---------------------------------------------------------

    st.markdown(
        f"""<style>
{theme_variables}

{css_content}
</style>""",
        unsafe_allow_html=True,
    )