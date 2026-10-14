from pathlib import Path

from models.train import (
    load_training_data,
    load_tokenizer,
    load_model,
    tokenize_dataset,
    prepare_training_datasets,
    create_data_collator,
    get_training_config,
    create_training_arguments,
    create_trainer,
    fine_tune_model,
)

# Load the existing processed datasets
train_df, validation_df = load_training_data()

# Keep this experiment deliberately small
train_df = train_df.head(8).copy()
validation_df = validation_df.head(4).copy()

print(f"Training examples: {len(train_df)}")
print(f"Validation examples: {len(validation_df)}")

# Load pretrained FLAN-T5-small
tokenizer = load_tokenizer()
model = load_model()

# Tokenize both datasets
train_tokens = tokenize_dataset(train_df, tokenizer)
validation_tokens = tokenize_dataset(validation_df, tokenizer)

train_dataset, validation_dataset = prepare_training_datasets(
    train_tokens,
    validation_tokens,
)

# Dynamic padding
data_collator = create_data_collator(tokenizer, model)

# Smoke-test configuration
config = get_training_config()
config["num_train_epochs"] = 1
config["train_batch_size"] = 2
config["eval_batch_size"] = 2

# Use a separate directory from the final model
config["output_dir"] = str(
    Path(config["output_dir"]).parent / "smoke-test"
)

training_args = create_training_arguments(config)

trainer = create_trainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=train_dataset,
    validation_dataset=validation_dataset,
    data_collator=data_collator,
    training_args=training_args,
)

print("Starting smoke test...")

result = fine_tune_model(trainer)

print("Smoke test completed successfully!")
print("Training loss:", result.training_loss)