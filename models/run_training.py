
"""
Run FLAN-T5-small fine-tuning for MedQuad AI.
"""

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
    save_trained_model,
)


def main():
    # 1. Load datasets
    print("Loading training and validation datasets...")
    train_df, validation_df = load_training_data()

    print(f"Training examples: {len(train_df)}")
    print(f"Validation examples: {len(validation_df)}")

    # 2. Load pretrained model and tokenizer
    print("Loading FLAN-T5-small...")
    tokenizer = load_tokenizer()
    model = load_model()

    # 3. Tokenize datasets
    print("Tokenizing datasets...")
    train_tokens = tokenize_dataset(train_df, tokenizer)
    validation_tokens = tokenize_dataset(
        validation_df, tokenizer
    )

    # 4. Prepare PyTorch datasets
    train_dataset, validation_dataset = prepare_training_datasets(
        train_tokens,
        validation_tokens,
    )

    # 5. Create data collator
    data_collator = create_data_collator(tokenizer, model)

    # 6. Configure training
    print("Configuring training...")
    config = get_training_config()

    config["num_train_epochs"] = 3
    config["train_batch_size"] = 4
    config["eval_batch_size"] = 4

    checkpoint_dir = Path(
        "artifacts/models/training-checkpoints"
    )
    final_model_dir = Path(
        "artifacts/models/flan-t5-medquad"
    )

    config["output_dir"] = str(checkpoint_dir)

    training_args = create_training_arguments(config)

    # 7. Initialize trainer
    trainer = create_trainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=train_dataset,
        validation_dataset=validation_dataset,
        data_collator=data_collator,
        training_args=training_args,
    )

    # 8. Fine-tune model
    print("Starting FLAN-T5 fine-tuning...")
    result = fine_tune_model(trainer)

    print("Training completed!")
    print(f"Training loss: {result.training_loss:.4f}")

    # 9. Save fine-tuned model
    print("Saving model and tokenizer...")
    save_trained_model(
        trainer,
        tokenizer,
        output_dir=final_model_dir,
    )

    print(f"Model saved to: {final_model_dir}")


if __name__ == "__main__":
    main()
