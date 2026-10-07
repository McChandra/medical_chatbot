"""
train.py

Purpose:
    Prepare and fine-tune FLAN-T5 on the MedQuAD dataset.

Responsibilities:
    - Load training and validation datasets
    - Validate model-ready data
    - Load the FLAN-T5 tokenizer
    - Initialize the pretrained FLAN-T5 model
    - Tokenize inputs and target answers
    - Validate tokenized datasets
    - Prepare datasets for training
    - Configure dynamic sequence padding
    - Define training hyperparameters
    - Fine-tune the model
    - Save the trained model artifact

Current Stage:
    - Load training and validation datasets
    - Validate model-ready data
    - Load FLAN-T5 tokenizer
    - Initialize pretrained FLAN-T5 model
    - Tokenize input and target sequences
    - Validate tokenized datasets
    - Prepare model-ready datasets
    - Configure dynamic sequence padding
    - Define training configuration

Model:
    google/flan-t5-small
"""


# ------------------------------------------------------------------
# IMPORTS
# ------------------------------------------------------------------

from pathlib import Path

import pandas as pd

from transformers import (
    AutoTokenizer,
    AutoModelForSeq2SeqLM,
    BatchEncoding,
    DataCollatorForSeq2Seq
)


# ------------------------------------------------------------------
# MODEL CONFIGURATION
# ------------------------------------------------------------------

MODEL_NAME = "google/flan-t5-small"

MAX_INPUT_LENGTH = 64
MAX_TARGET_LENGTH = 512


# ------------------------------------------------------------------
# TRAINING CONFIGURATION
# ------------------------------------------------------------------

NUM_TRAIN_EPOCHS = 3

TRAIN_BATCH_SIZE = 4
EVAL_BATCH_SIZE = 4

LEARNING_RATE = 5e-5
WEIGHT_DECAY = 0.01

SAVE_TOTAL_LIMIT = 1


# ------------------------------------------------------------------
# PROJECT PATHS
# ------------------------------------------------------------------

# Current file:
# medical_chatbot/models/train.py
#
# parent        -> models/
# parent.parent -> medical_chatbot/

PROJECT_ROOT = Path(__file__).resolve().parent.parent


DATA_DIR = (
    PROJECT_ROOT
    / "data"
    / "processed"
)


TRAIN_PATH = (
    DATA_DIR
    / "train.csv"
)


VALIDATION_PATH = (
    DATA_DIR
    / "validation.csv"
)


MODEL_OUTPUT_DIR = (
    PROJECT_ROOT
    / "artifacts"
    / "models"
    / "flan-t5-medquad"
)


# ------------------------------------------------------------------
# REQUIRED MODEL FEATURES
# ------------------------------------------------------------------

REQUIRED_COLUMNS = [
    "input_text",
    "target_text"
]


TOKENIZED_FEATURES = [
    "input_ids",
    "attention_mask",
    "labels"
]


# ------------------------------------------------------------------
# VALIDATE DATASET
# ------------------------------------------------------------------

def _validate_dataset(
    dataframe: pd.DataFrame,
    dataset_name: str
) -> None:
    """
    Validate a dataset before model training.

    Checks:
        - Input is a Pandas DataFrame
        - Dataset is not empty
        - Required model columns exist
        - Required columns contain no missing values
        - Required text columns contain no empty strings

    Parameters
    ----------
    dataframe : pd.DataFrame
        Dataset to validate.

    dataset_name : str
        Name used in validation messages.

    Returns
    -------
    None
    """

    # --------------------------------------------------------------
    # Check DataFrame type
    # --------------------------------------------------------------

    if not isinstance(
        dataframe,
        pd.DataFrame
    ):
        raise TypeError(
            f"{dataset_name} must be a Pandas DataFrame."
        )


    # --------------------------------------------------------------
    # Check dataset is not empty
    # --------------------------------------------------------------

    if dataframe.empty:
        raise ValueError(
            f"{dataset_name} dataset is empty."
        )


    # --------------------------------------------------------------
    # Check required columns
    # --------------------------------------------------------------

    missing_columns = [
        column
        for column in REQUIRED_COLUMNS
        if column not in dataframe.columns
    ]

    if missing_columns:
        raise ValueError(
            f"{dataset_name} dataset is missing "
            f"required columns: {missing_columns}"
        )


    # --------------------------------------------------------------
    # Check missing values
    # --------------------------------------------------------------

    missing_values = (
        dataframe[
            REQUIRED_COLUMNS
        ]
        .isnull()
        .sum()
    )

    if missing_values.any():
        raise ValueError(
            f"{dataset_name} contains missing values "
            f"in model input/target columns: "
            f"{missing_values.to_dict()}"
        )


    # --------------------------------------------------------------
    # Check empty text values
    # --------------------------------------------------------------

    for column in REQUIRED_COLUMNS:

        empty_values = (
            dataframe[column]
            .astype(str)
            .str.strip()
            .eq("")
            .sum()
        )

        if empty_values > 0:
            raise ValueError(
                f"{dataset_name} contains "
                f"{empty_values} empty values "
                f"in '{column}'."
            )


# ------------------------------------------------------------------
# LOAD TRAINING DATA
# ------------------------------------------------------------------

def load_training_data(
    train_path: str | Path = TRAIN_PATH,
    validation_path: str | Path = VALIDATION_PATH
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Load and validate the MedQuAD training and validation datasets.

    Parameters
    ----------
    train_path : str | Path
        Path to the training CSV file.

    validation_path : str | Path
        Path to the validation CSV file.

    Returns
    -------
    train_df : pd.DataFrame
        Validated training dataset.

    validation_df : pd.DataFrame
        Validated validation dataset.
    """

    # --------------------------------------------------------------
    # Convert paths to Path objects
    # --------------------------------------------------------------

    train_path = Path(
        train_path
    )

    validation_path = Path(
        validation_path
    )


    # --------------------------------------------------------------
    # Check files exist
    # --------------------------------------------------------------

    if not train_path.exists():
        raise FileNotFoundError(
            f"Training dataset not found: "
            f"{train_path}"
        )

    if not validation_path.exists():
        raise FileNotFoundError(
            f"Validation dataset not found: "
            f"{validation_path}"
        )


    # --------------------------------------------------------------
    # Load CSV datasets
    # --------------------------------------------------------------

    train_df = pd.read_csv(
        train_path
    )

    validation_df = pd.read_csv(
        validation_path
    )


    # --------------------------------------------------------------
    # Validate datasets
    # --------------------------------------------------------------

    _validate_dataset(
        train_df,
        "Training"
    )

    _validate_dataset(
        validation_df,
        "Validation"
    )


    # --------------------------------------------------------------
    # Return validated datasets
    # --------------------------------------------------------------

    return (
        train_df,
        validation_df
    )


# ------------------------------------------------------------------
# LOAD FLAN-T5 TOKENIZER
# ------------------------------------------------------------------

def load_tokenizer(
    model_name: str = MODEL_NAME
):
    """
    Load the tokenizer associated with FLAN-T5.

    Parameters
    ----------
    model_name : str
        Hugging Face model identifier.

    Returns
    -------
    tokenizer
        Tokenizer associated with the selected FLAN-T5 model.
    """

    tokenizer = AutoTokenizer.from_pretrained(
        model_name
    )

    return tokenizer


# ------------------------------------------------------------------
# LOAD FLAN-T5 MODEL
# ------------------------------------------------------------------

def load_model(
    model_name: str = MODEL_NAME
):
    """
    Load the pretrained FLAN-T5 sequence-to-sequence model.

    The model is loaded using Hugging Face Transformers and is
    configured for conditional text generation.

    Loading the model requires a supported deep-learning backend
    such as PyTorch.

    Parameters
    ----------
    model_name : str
        Hugging Face model identifier.

    Returns
    -------
    model
        Pretrained FLAN-T5 model for conditional text generation.
    """

    model = AutoModelForSeq2SeqLM.from_pretrained(
        model_name
    )

    return model


# ------------------------------------------------------------------
# TOKENIZE DATASET
# ------------------------------------------------------------------

def tokenize_dataset(
    dataframe: pd.DataFrame,
    tokenizer,
    max_input_length: int = MAX_INPUT_LENGTH,
    max_target_length: int = MAX_TARGET_LENGTH
) -> dict:
    """
    Tokenize model inputs and target answers for FLAN-T5.

    Input:
        input_text

    Target:
        target_text

    Fixed-length padding is not applied here.
    Dynamic padding will be performed later during training.

    Parameters
    ----------
    dataframe : pd.DataFrame
        Model-ready MedQuAD dataset.

    tokenizer
        FLAN-T5 tokenizer.

    max_input_length : int
        Maximum input sequence length.

    max_target_length : int
        Maximum target sequence length.

    Returns
    -------
    tokenized_data : dict
        Tokenized representation containing:
        - input_ids
        - attention_mask
        - labels
    """

    # --------------------------------------------------------------
    # Validate dataset
    # --------------------------------------------------------------

    _validate_dataset(
        dataframe,
        "Tokenization"
    )


    # --------------------------------------------------------------
    # Tokenize input sequences
    # --------------------------------------------------------------

    model_inputs = tokenizer(
        dataframe["input_text"].tolist(),
        max_length=max_input_length,
        truncation=True,
        padding=False
    )


    # --------------------------------------------------------------
    # Tokenize target sequences
    # --------------------------------------------------------------

    target_tokens = tokenizer(
        text_target=dataframe["target_text"].tolist(),
        max_length=max_target_length,
        truncation=True,
        padding=False
    )


    # --------------------------------------------------------------
    # Add target token IDs as model labels
    # --------------------------------------------------------------

    model_inputs["labels"] = (
        target_tokens["input_ids"]
    )


    # --------------------------------------------------------------
    # Return tokenized dataset
    # --------------------------------------------------------------

    return model_inputs


# ------------------------------------------------------------------
# VALIDATE TOKENIZED DATASET
# ------------------------------------------------------------------

def validate_tokenized_dataset(
    tokenized_data,
    dataset_name: str
) -> dict:
    """
    Validate tokenized data before model training.

    Supports Hugging Face BatchEncoding objects and standard
    Python dictionaries.

    Checks:
        - Tokenized data has a supported structure
        - Required tokenized features exist
        - Dataset is not empty
        - input_ids, attention_mask, and labels are aligned

    Parameters
    ----------
    tokenized_data : BatchEncoding | dict
        Tokenized dataset containing:
        - input_ids
        - attention_mask
        - labels

    dataset_name : str
        Name of the dataset being validated.

    Returns
    -------
    report : dict
        Validation summary containing feature counts
        and alignment status.
    """

    # --------------------------------------------------------------
    # Check tokenized data type
    # --------------------------------------------------------------

    if not isinstance(
        tokenized_data,
        (BatchEncoding, dict)
    ):
        raise TypeError(
            f"{dataset_name} tokenized data must be "
            f"a Hugging Face BatchEncoding or dictionary. "
            f"Received: {type(tokenized_data).__name__}"
        )


    # --------------------------------------------------------------
    # Check required tokenized features
    # --------------------------------------------------------------

    missing_features = [
        feature
        for feature in TOKENIZED_FEATURES
        if feature not in tokenized_data
    ]

    if missing_features:
        raise ValueError(
            f"{dataset_name} tokenized data is missing "
            f"required features: {missing_features}"
        )


    # --------------------------------------------------------------
    # Count tokenized examples
    # --------------------------------------------------------------

    input_count = len(
        tokenized_data["input_ids"]
    )

    attention_count = len(
        tokenized_data["attention_mask"]
    )

    label_count = len(
        tokenized_data["labels"]
    )


    # --------------------------------------------------------------
    # Check dataset is not empty
    # --------------------------------------------------------------

    if input_count == 0:
        raise ValueError(
            f"{dataset_name} tokenized dataset is empty."
        )


    # --------------------------------------------------------------
    # Check feature alignment
    # --------------------------------------------------------------

    aligned = (
        input_count
        == attention_count
        == label_count
    )

    if not aligned:
        raise ValueError(
            f"{dataset_name} tokenized features are not aligned. "
            f"input_ids={input_count}, "
            f"attention_mask={attention_count}, "
            f"labels={label_count}"
        )


    # --------------------------------------------------------------
    # Create validation report
    # --------------------------------------------------------------

    report = {
        "dataset": dataset_name,
        "data_type": type(tokenized_data).__name__,
        "input_sequences": input_count,
        "attention_masks": attention_count,
        "target_labels": label_count,
        "aligned": aligned
    }


    # --------------------------------------------------------------
    # Return validation report
    # --------------------------------------------------------------

    return report


# ------------------------------------------------------------------
# MODEL-READY DATASET
# ------------------------------------------------------------------

class TokenizedDataset:
    """
    Lightweight dataset wrapper for tokenized FLAN-T5 data.

    Each dataset item contains:
        - input_ids
        - attention_mask
        - labels

    Dynamic padding is intentionally not performed here.
    Padding will be handled later by the sequence-to-sequence
    data collator during batch creation.
    """

    def __init__(
        self,
        tokenized_data,
        dataset_name: str = "Dataset"
    ):
        """
        Initialize the model-ready dataset.

        Parameters
        ----------
        tokenized_data
            Tokenized dataset containing input_ids,
            attention_mask, and labels.

        dataset_name : str
            Name used when validating the dataset.
        """

        # ----------------------------------------------------------
        # Validate before storing
        # ----------------------------------------------------------

        validate_tokenized_dataset(
            tokenized_data,
            dataset_name
        )

        self.tokenized_data = tokenized_data


    def __len__(self):
        """
        Return the number of examples in the dataset.
        """

        return len(
            self.tokenized_data["input_ids"]
        )


    def __getitem__(
        self,
        index: int
    ):
        """
        Return one tokenized example.

        Parameters
        ----------
        index : int
            Dataset example index.

        Returns
        -------
        example : dict
            Dictionary containing input_ids,
            attention_mask, and labels.
        """

        return {
            feature: self.tokenized_data[feature][index]
            for feature in TOKENIZED_FEATURES
        }


# ------------------------------------------------------------------
# PREPARE TRAINING DATASETS
# ------------------------------------------------------------------

def prepare_training_datasets(
    tokenized_train,
    tokenized_validation
) -> tuple[TokenizedDataset, TokenizedDataset]:
    """
    Convert tokenized training and validation data into
    model-ready dataset objects.

    Parameters
    ----------
    tokenized_train
        Tokenized training data.

    tokenized_validation
        Tokenized validation data.

    Returns
    -------
    train_dataset : TokenizedDataset
        Model-ready training dataset.

    validation_dataset : TokenizedDataset
        Model-ready validation dataset.
    """

    # --------------------------------------------------------------
    # Create training dataset
    # --------------------------------------------------------------

    train_dataset = TokenizedDataset(
        tokenized_train,
        "Training"
    )


    # --------------------------------------------------------------
    # Create validation dataset
    # --------------------------------------------------------------

    validation_dataset = TokenizedDataset(
        tokenized_validation,
        "Validation"
    )


    # --------------------------------------------------------------
    # Return model-ready datasets
    # --------------------------------------------------------------

    return (
        train_dataset,
        validation_dataset
    )


# ------------------------------------------------------------------
# CREATE SEQUENCE-TO-SEQUENCE DATA COLLATOR
# ------------------------------------------------------------------

def create_data_collator(
    tokenizer,
    model=None
):
    """
    Create a dynamic data collator for FLAN-T5 training.

    The collator dynamically pads input sequences and target labels
    to the longest sequence within each training batch.

    Parameters
    ----------
    tokenizer
        FLAN-T5 tokenizer used to prepare the datasets.

    model
        FLAN-T5 model used during sequence-to-sequence training.
        The model can be omitted during pipeline preparation.

    Returns
    -------
    data_collator : DataCollatorForSeq2Seq
        Hugging Face sequence-to-sequence data collator.
    """

    data_collator = DataCollatorForSeq2Seq(
        tokenizer=tokenizer,
        model=model,
        padding=True,
        label_pad_token_id=-100,
        return_tensors="pt"
    )

    return data_collator


# ------------------------------------------------------------------
# GET TRAINING CONFIGURATION
# ------------------------------------------------------------------

def get_training_config() -> dict:
    """
    Return the FLAN-T5 fine-tuning configuration.

    The configuration is kept independent of the training backend
    so that it can be inspected and validated before the actual
    PyTorch training environment is initialized.

    Returns
    -------
    config : dict
        FLAN-T5 training hyperparameters and artifact configuration.
    """

    config = {
        "model_name": MODEL_NAME,
        "num_train_epochs": NUM_TRAIN_EPOCHS,
        "train_batch_size": TRAIN_BATCH_SIZE,
        "eval_batch_size": EVAL_BATCH_SIZE,
        "learning_rate": LEARNING_RATE,
        "weight_decay": WEIGHT_DECAY,
        "max_input_length": MAX_INPUT_LENGTH,
        "max_target_length": MAX_TARGET_LENGTH,
        "save_total_limit": SAVE_TOTAL_LIMIT,
        "output_dir": str(MODEL_OUTPUT_DIR)
    }

    return config

# ------------------------------------------------------------------
# CREATE SEQUENCE-TO-SEQUENCE TRAINING ARGUMENTS
# ------------------------------------------------------------------

def create_training_arguments(
    training_config: dict | None = None
):
    """
    Create Hugging Face Seq2SeqTrainingArguments for FLAN-T5.

    Parameters
    ----------
    training_config : dict | None
        Training configuration. If None, the default configuration
        from get_training_config() is used.

    Returns
    -------
    training_args : Seq2SeqTrainingArguments
        Hugging Face sequence-to-sequence training arguments.

    Notes
    -----
    This function requires the PyTorch training environment.
    """

    import inspect

    from transformers import Seq2SeqTrainingArguments

    if training_config is None:
        training_config = get_training_config()

    # Ensure model artifact directory exists
    output_dir = Path(
        training_config["output_dir"]
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    # --------------------------------------------------------------
    # Base training arguments
    # --------------------------------------------------------------

    argument_values = {
        "output_dir": str(output_dir),
        "num_train_epochs": training_config[
            "num_train_epochs"
        ],
        "per_device_train_batch_size": training_config[
            "train_batch_size"
        ],
        "per_device_eval_batch_size": training_config[
            "eval_batch_size"
        ],
        "learning_rate": training_config[
            "learning_rate"
        ],
        "weight_decay": training_config[
            "weight_decay"
        ],
        "save_strategy": "epoch",
        "logging_strategy": "steps",
        "logging_steps": 25,
        "save_total_limit": training_config[
            "save_total_limit"
        ],
        "predict_with_generate": True,
        "report_to": "none"
    }

    # --------------------------------------------------------------
    # Handle Transformers version differences
    # --------------------------------------------------------------

    signature = inspect.signature(
        Seq2SeqTrainingArguments.__init__
    )

    if "eval_strategy" in signature.parameters:
        argument_values["eval_strategy"] = "epoch"

    elif "evaluation_strategy" in signature.parameters:
        argument_values["evaluation_strategy"] = "epoch"

    else:
        raise RuntimeError(
            "The installed Transformers version does not expose "
            "'eval_strategy' or 'evaluation_strategy' in "
            "Seq2SeqTrainingArguments."
        )

    # --------------------------------------------------------------
    # Create training arguments
    # --------------------------------------------------------------

    training_args = Seq2SeqTrainingArguments(
        **argument_values
    )

    return training_args

# ------------------------------------------------------------------
# CREATE SEQUENCE-TO-SEQUENCE TRAINER
# ------------------------------------------------------------------

def create_trainer(
    model,
    tokenizer,
    train_dataset,
    validation_dataset,
    data_collator,
    training_args
):
    """
    Create the Hugging Face Seq2SeqTrainer for FLAN-T5 fine-tuning.

    Parameters
    ----------
    model
        Pretrained FLAN-T5 model.

    tokenizer
        FLAN-T5 tokenizer.

    train_dataset
        Model-ready training dataset.

    validation_dataset
        Model-ready validation dataset.

    data_collator
        Dynamic sequence-to-sequence data collator.

    training_args
        Hugging Face Seq2SeqTrainingArguments.

    Returns
    -------
    trainer : Seq2SeqTrainer
        Configured FLAN-T5 Trainer.

    Notes
    -----
    This function requires the PyTorch training environment.
    """

    import inspect

    from transformers import Seq2SeqTrainer

    trainer_values = {
        "model": model,
        "args": training_args,
        "train_dataset": train_dataset,
        "eval_dataset": validation_dataset,
        "data_collator": data_collator
    }

    # --------------------------------------------------------------
    # Transformers compatibility
    #
    # Older versions use "tokenizer".
    # Newer versions may use "processing_class".
    # --------------------------------------------------------------

    signature = inspect.signature(
        Seq2SeqTrainer.__init__
    )

    if "processing_class" in signature.parameters:
        trainer_values["processing_class"] = tokenizer

    elif "tokenizer" in signature.parameters:
        trainer_values["tokenizer"] = tokenizer

    # --------------------------------------------------------------
    # Create Trainer
    # --------------------------------------------------------------

    trainer = Seq2SeqTrainer(
        **trainer_values
    )

    return trainer

# ------------------------------------------------------------------
# FINE-TUNE FLAN-T5 MODEL
# ------------------------------------------------------------------

def fine_tune_model(trainer):
    """
    Fine-tune FLAN-T5 using the configured Seq2SeqTrainer.

    Parameters
    ----------
    trainer
        Configured Hugging Face Seq2SeqTrainer containing the model,
        training dataset, validation dataset, training arguments,
        and data collator.

    Returns
    -------
    training_result
        Training result returned by Hugging Face Trainer.

    Notes
    -----
    This function requires a PyTorch-enabled training environment.
    """

    # --------------------------------------------------------------
    # Validate Trainer
    # --------------------------------------------------------------

    if trainer is None:
        raise ValueError(
            "Trainer cannot be None."
        )


    # --------------------------------------------------------------
    # Start model fine-tuning
    # --------------------------------------------------------------

    training_result = trainer.train()


    # --------------------------------------------------------------
    # Return training result
    # --------------------------------------------------------------

    return training_result

# ------------------------------------------------------------------
# SAVE FINE-TUNED MODEL
# ------------------------------------------------------------------

def save_trained_model(
    trainer,
    tokenizer,
    output_dir: str | Path = MODEL_OUTPUT_DIR
) -> Path:
    """
    Save the fine-tuned FLAN-T5 model and tokenizer.

    Parameters
    ----------
    trainer
        Trained Hugging Face Seq2SeqTrainer.

    tokenizer
        FLAN-T5 tokenizer associated with the trained model.

    output_dir : str | Path
        Directory where the model and tokenizer artifacts
        will be saved.

    Returns
    -------
    output_dir : Path
        Path containing the saved model artifacts.

    Notes
    -----
    This function should be called after fine-tuning has completed.
    """

    # --------------------------------------------------------------
    # Validate inputs
    # --------------------------------------------------------------

    if trainer is None:
        raise ValueError(
            "Trainer cannot be None."
        )

    if tokenizer is None:
        raise ValueError(
            "Tokenizer cannot be None."
        )


    # --------------------------------------------------------------
    # Prepare output directory
    # --------------------------------------------------------------

    output_dir = Path(
        output_dir
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True
    )


    # --------------------------------------------------------------
    # Save fine-tuned model
    # --------------------------------------------------------------

    trainer.save_model(
        str(output_dir)
    )


    # --------------------------------------------------------------
    # Save tokenizer
    # --------------------------------------------------------------

    tokenizer.save_pretrained(
        str(output_dir)
    )


    # --------------------------------------------------------------
    # Return saved artifact location
    # --------------------------------------------------------------

    return output_dir