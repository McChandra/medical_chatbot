"""Bounded JSON-schema decoding for private local inference, not factual validation."""
import json
from functools import lru_cache


def schema_from_format(response_format):
    if response_format == {'type':'json_object'}:
        return None
    if not isinstance(response_format,dict) or response_format.get('type') != 'json_schema':
        raise ValueError('Unsupported response format')
    envelope = response_format.get('json_schema', {})
    schema = envelope.get('schema')
    if not isinstance(schema,dict) or len(json.dumps(schema)) > 35000:
        raise ValueError('Invalid or oversized schema')
    nodes = 0
    def check(node, depth=0):
        nonlocal nodes
        nodes += 1
        if nodes > 2500 or depth > 16:
            raise ValueError('Schema complexity limit')
        if isinstance(node,dict):
            if any(k in node for k in ['$ref','$dynamicRef','pattern','patternProperties']):
                raise ValueError('Schema references and regular expressions are disabled')
            for value in node.values():check(value,depth+1)
        elif isinstance(node,list):
            for value in node:check(value,depth+1)
    check(schema)
    from jsonschema import Draft202012Validator
    Draft202012Validator.check_schema(schema)
    return schema


@lru_cache(maxsize=1)
def prepare_tokenizer_data(tokenizer):
    from lmformatenforcer.integrations.transformers import build_token_enforcer_tokenizer_data
    return build_token_enforcer_tokenizer_data(tokenizer)


def prefix_function(tokenizer, schema):
    from lmformatenforcer import JsonSchemaParser,CharacterLevelParserConfig
    from lmformatenforcer.integrations.transformers import build_transformers_prefix_allowed_tokens_fn
    config=CharacterLevelParserConfig(max_consecutive_whitespaces=1)
    return build_transformers_prefix_allowed_tokens_fn(prepare_tokenizer_data(tokenizer), JsonSchemaParser(schema, config=config))


def validate_output(text, schema):
    if schema is not None:
        from jsonschema import Draft202012Validator
        Draft202012Validator(schema).validate(json.loads(text))
