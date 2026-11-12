import unittest
from structured_output import schema_from_format,validate_output


class StructuredOutputTests(unittest.TestCase):
    def test_schema_is_bounded_and_external_references_are_rejected(self):
        for schema in [{'type':'object','$ref':'https://attacker.invalid/schema'},{'type':'string','pattern':'a+'}]:
            with self.assertRaises(ValueError):schema_from_format({'type':'json_schema','json_schema':{'schema':schema}})
        self.assertIsNone(schema_from_format({'type':'json_object'}))

    def test_constraint_parser_and_postvalidation_enforce_short_known_ids(self):
        from lmformatenforcer import JsonSchemaParser
        schema={'type':'object','properties':{'id':{'type':'string','enum':['S1']},'text':{'type':'string','maxLength':4}},'required':['id','text'],'additionalProperties':False}
        envelope={'type':'json_schema','json_schema':{'schema':schema}}
        schema_from_format(envelope)
        parser=JsonSchemaParser(schema)
        text='{"id":"S1","text":"safe"}'
        for char in text:
            self.assertIn(char,parser.get_allowed_characters())
            parser=parser.add_character(char)
        self.assertTrue(parser.can_end());validate_output(text,schema)
        with self.assertRaises(Exception):validate_output('{"id":"unknown","text":"too long"}',schema)


if __name__=='__main__':unittest.main()
