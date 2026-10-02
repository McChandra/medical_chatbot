"""
eda.py

Purpose:
    Perform exploratory data analysis (EDA) on the cleaned
    MedQuAD dataset.

Responsibilities:
    - Analyze dataset structure
    - Analyze question and answer lengths
    - Analyze focus-area distribution
    - Analyze source distribution
    - Detect duplicate questions
    - Detect questions associated with multiple answers
    - Identify unusually short or long Q&A records
    - Generate EDA visualizations

Important:
    This module analyzes the dataset but DOES NOT modify it.
"""

import pandas as pd
import matplotlib.pyplot as plt


# ==================================================================
# DATASET SUMMARY
# ==================================================================

def dataset_summary(dataframe: pd.DataFrame) -> dict:
    """
    Generate a basic summary of the MedQuAD dataset.

    Parameters
    ----------
    dataframe : pd.DataFrame
        Cleaned MedQuAD dataset.

    Returns
    -------
    dict
        Dataset summary.
    """

    if not isinstance(dataframe, pd.DataFrame):
        raise TypeError(
            "dataset_summary() expects a Pandas DataFrame."
        )

    if dataframe.empty:
        raise ValueError(
            "Cannot perform EDA on an empty DataFrame."
        )

    summary = {
        "rows": len(dataframe),

        "columns": len(dataframe.columns),

        "column_names": dataframe.columns.tolist(),

        "data_types": {
            column: str(dtype)
            for column, dtype in dataframe.dtypes.items()
        },

        "missing_values": (
            dataframe
            .isna()
            .sum()
            .to_dict()
        ),

        "duplicate_rows": int(
            dataframe.duplicated().sum()
        ),
    }

    return summary


# ==================================================================
# TEXT LENGTH ANALYSIS
# ==================================================================

def text_length_analysis(
    dataframe: pd.DataFrame,
    column: str
) -> dict:
    """
    Analyze character and word lengths for a text column.

    Useful for:
        - question
        - answer
    """

    if column not in dataframe.columns:
        raise ValueError(
            f"Column '{column}' does not exist."
        )

    text = dataframe[column].astype(str)

    # Character counts
    character_lengths = text.str.len()

    # Word counts
    word_lengths = (
        text
        .str.split()
        .str.len()
    )

    statistics = {

        "count": len(text),

        "characters": {

            "minimum": int(
                character_lengths.min()
            ),

            "maximum": int(
                character_lengths.max()
            ),

            "mean": round(
                float(character_lengths.mean()),
                2
            ),

            "median": float(
                character_lengths.median()
            ),
        },

        "words": {

            "minimum": int(
                word_lengths.min()
            ),

            "maximum": int(
                word_lengths.max()
            ),

            "mean": round(
                float(word_lengths.mean()),
                2
            ),

            "median": float(
                word_lengths.median()
            ),

            "95th_percentile": round(
                float(word_lengths.quantile(0.95)),
                2
            ),

            "99th_percentile": round(
                float(word_lengths.quantile(0.99)),
                2
            ),
        },
    }

    return statistics


# ==================================================================
# CATEGORY DISTRIBUTION
# ==================================================================

def category_distribution(
    dataframe: pd.DataFrame,
    column: str
) -> pd.DataFrame:
    """
    Calculate count and percentage distribution for
    a categorical column.

    Useful for:
        - focus_area
        - source
    """

    if column not in dataframe.columns:
        raise ValueError(
            f"Column '{column}' does not exist."
        )

    counts = dataframe[column].value_counts(
        dropna=False
    )

    percentages = (
        dataframe[column]
        .value_counts(
            normalize=True,
            dropna=False
        )
        .mul(100)
        .round(2)
    )

    distribution = pd.DataFrame({
        "count": counts,
        "percentage": percentages
    })

    return distribution


# ==================================================================
# DUPLICATE QUESTION ANALYSIS
# ==================================================================

def duplicate_question_analysis(
    dataframe: pd.DataFrame
) -> dict:
    """
    Analyze repeated questions.

    Exact duplicate rows were already removed during preprocessing.

    However, the same question may still occur with:
        - different answers
        - different sources
        - different focus areas

    These records require investigation before dataset splitting.
    """

    if "question" not in dataframe.columns:
        raise ValueError(
            "The dataset does not contain a 'question' column."
        )

    duplicate_mask = dataframe.duplicated(
        subset=["question"],
        keep=False
    )

    duplicate_questions = dataframe[
        duplicate_mask
    ].copy()

    unique_repeated_questions = (
        duplicate_questions["question"].nunique()
    )

    return {

        "rows_with_repeated_questions": int(
            len(duplicate_questions)
        ),

        "unique_repeated_questions": int(
            unique_repeated_questions
        ),

        "data": duplicate_questions,
    }


# ==================================================================
# MULTIPLE ANSWERS ANALYSIS
# ==================================================================

def multiple_answer_analysis(
    dataframe: pd.DataFrame
) -> pd.DataFrame:
    """
    Identify questions associated with more than one
    unique answer.

    This is important before train/validation/test splitting
    because repeated questions could otherwise cause data leakage.
    """

    required_columns = {
        "question",
        "answer"
    }

    if not required_columns.issubset(
        dataframe.columns
    ):
        raise ValueError(
            "Dataset must contain 'question' and 'answer' columns."
        )

    answer_counts = (
        dataframe
        .groupby("question")["answer"]
        .nunique()
        .sort_values(
            ascending=False
        )
    )

    multiple_answers = answer_counts[
        answer_counts > 1
    ]

    return multiple_answers.to_frame(
        name="unique_answers"
    )


# ==================================================================
# LENGTH OUTLIER ANALYSIS
# ==================================================================

def length_outlier_analysis(
    dataframe: pd.DataFrame,
    column: str,
    short_threshold: int = 5,
    long_quantile: float = 0.99
) -> dict:
    """
    Identify unusually short and long text records.

    Parameters
    ----------
    dataframe : pd.DataFrame
        MedQuAD dataset.

    column : str
        Text column to analyze.

    short_threshold : int
        Records containing this many words or fewer
        are considered short.

    long_quantile : float
        Quantile used to identify unusually long records.

        Default:
            0.99 = top 1%
    """

    if column not in dataframe.columns:
        raise ValueError(
            f"Column '{column}' does not exist."
        )

    word_count = (
        dataframe[column]
        .astype(str)
        .str.split()
        .str.len()
    )

    long_threshold = float(
        word_count.quantile(
            long_quantile
        )
    )

    short_records = dataframe[
        word_count <= short_threshold
    ].copy()

    long_records = dataframe[
        word_count >= long_threshold
    ].copy()

    return {

        "short_threshold_words":
            short_threshold,

        "short_record_count":
            int(len(short_records)),

        "long_quantile":
            long_quantile,

        "long_threshold_words":
            long_threshold,

        "long_record_count":
            int(len(long_records)),

        "short_records":
            short_records,

        "long_records":
            long_records,
    }


# ==================================================================
# VISUALIZATION: TEXT LENGTH DISTRIBUTION
# ==================================================================

def plot_text_length_distribution(
    dataframe: pd.DataFrame,
    column: str,
    bins: int = 50,
    percentile: float | None = None
):
    """
    Plot the word-count distribution of a text column.

    Parameters
    ----------
    dataframe : pd.DataFrame
        MedQuAD dataset.

    column : str
        Text column to visualize.

    bins : int
        Number of histogram bins.

    percentile : float | None
        Optional upper percentile limit.

        Example:
            percentile=0.99

        removes the extreme top 1% from the visualization
        WITHOUT modifying the actual dataset.

    Returns
    -------
    matplotlib.figure.Figure
        Generated Matplotlib figure.
    """

    if column not in dataframe.columns:
        raise ValueError(
            f"Column '{column}' does not exist."
        )

    word_counts = (
        dataframe[column]
        .astype(str)
        .str.split()
        .str.len()
    )

    # --------------------------------------------------------------
    # Optional visualization-only percentile filtering
    # --------------------------------------------------------------

    if percentile is not None:

        if not 0 < percentile <= 1:
            raise ValueError(
                "percentile must be between 0 and 1."
            )

        upper_limit = word_counts.quantile(
            percentile
        )

        plot_data = word_counts[
            word_counts <= upper_limit
        ]

        title = (
            f"{column.capitalize()} Word Length Distribution "
            f"(up to {int(percentile * 100)}th percentile)"
        )

    else:

        plot_data = word_counts

        title = (
            f"{column.capitalize()} Word Length Distribution"
        )

    # --------------------------------------------------------------
    # Plot
    # --------------------------------------------------------------

    fig, ax = plt.subplots(
        figsize=(10, 5)
    )

    ax.hist(
        plot_data,
        bins=bins,
        edgecolor="black"
    )

    ax.set_title(
        title
    )

    ax.set_xlabel(
        "Number of Words"
    )

    ax.set_ylabel(
        "Number of Records"
    )

    ax.grid(
        axis="y",
        alpha=0.3
    )

    fig.tight_layout()

    return fig


# ==================================================================
# VISUALIZATION: FOCUS AREA DISTRIBUTION
# ==================================================================

def plot_focus_area_distribution(
    dataframe: pd.DataFrame,
    top_n: int = 20
):
    """
    Plot the most common medical focus areas.

    Only the top N categories are displayed because MedQuAD
    contains many focus areas.

    Returns
    -------
    matplotlib.figure.Figure
    """

    if "focus_area" not in dataframe.columns:
        raise ValueError(
            "Dataset does not contain 'focus_area'."
        )

    counts = (
        dataframe["focus_area"]
        .value_counts()
        .head(top_n)
        .sort_values()
    )

    fig, ax = plt.subplots(
        figsize=(10, 7)
    )

    counts.plot(
        kind="barh",
        ax=ax
    )

    ax.set_title(
        f"Top {top_n} MedQuAD Focus Areas"
    )

    ax.set_xlabel(
        "Number of Q&A Records"
    )

    ax.set_ylabel(
        "Focus Area"
    )

    fig.tight_layout()

    return fig


# ==================================================================
# VISUALIZATION: SOURCE DISTRIBUTION
# ==================================================================

def plot_source_distribution(
    dataframe: pd.DataFrame,
    top_n: int = 15
):
    """
    Plot the most common MedQuAD data sources.

    Returns
    -------
    matplotlib.figure.Figure
    """

    if "source" not in dataframe.columns:
        raise ValueError(
            "Dataset does not contain 'source'."
        )

    counts = (
        dataframe["source"]
        .value_counts()
        .head(top_n)
        .sort_values()
    )

    fig, ax = plt.subplots(
        figsize=(10, 6)
    )

    counts.plot(
        kind="barh",
        ax=ax
    )

    ax.set_title(
        f"Top {top_n} MedQuAD Sources"
    )

    ax.set_xlabel(
        "Number of Q&A Records"
    )

    ax.set_ylabel(
        "Source"
    )

    fig.tight_layout()

    return fig


# ==================================================================
# VISUALIZATION: QUESTION VS ANSWER LENGTH
# ==================================================================

def plot_question_answer_length(
    dataframe: pd.DataFrame
):
    """
    Compare question and answer word-length distributions
    using a box plot.

    This helps visualize the large difference between
    input and output lengths.

    Returns
    -------
    matplotlib.figure.Figure
    """

    required_columns = {
        "question",
        "answer"
    }

    if not required_columns.issubset(
        dataframe.columns
    ):
        raise ValueError(
            "Dataset must contain 'question' and 'answer' columns."
        )

    question_words = (
        dataframe["question"]
        .astype(str)
        .str.split()
        .str.len()
    )

    answer_words = (
        dataframe["answer"]
        .astype(str)
        .str.split()
        .str.len()
    )

    fig, ax = plt.subplots(
        figsize=(8, 5)
    )

    ax.boxplot(
        [
            question_words,
            answer_words
        ],
        tick_labels=[
            "Questions",
            "Answers"
        ],
        showfliers=False
    )

    ax.set_title(
        "Question vs Answer Word Length"
    )

    ax.set_ylabel(
        "Number of Words"
    )

    fig.tight_layout()

    return fig


# ==================================================================
# COMPLETE MEDQUAD EDA
# ==================================================================

def run_eda(
    dataframe: pd.DataFrame
) -> dict:
    """
    Run the main MedQuAD exploratory data analysis.

    This function returns analytical results.

    Visualizations are intentionally kept separate so that
    notebooks, Streamlit, and other interfaces can decide
    which plots to display.

    Returns
    -------
    dict
        Collection of MedQuAD EDA results.
    """

    results = {

        "dataset_summary":
            dataset_summary(
                dataframe
            ),

        "question_length":
            text_length_analysis(
                dataframe,
                "question"
            ),

        "answer_length":
            text_length_analysis(
                dataframe,
                "answer"
            ),

        "focus_area_distribution":
            category_distribution(
                dataframe,
                "focus_area"
            ),

        "source_distribution":
            category_distribution(
                dataframe,
                "source"
            ),

        "duplicate_questions":
            duplicate_question_analysis(
                dataframe
            ),

        "multiple_answers":
            multiple_answer_analysis(
                dataframe
            ),

        "question_outliers":
            length_outlier_analysis(
                dataframe,
                "question"
            ),

        "answer_outliers":
            length_outlier_analysis(
                dataframe,
                "answer"
            ),
    }

    return results