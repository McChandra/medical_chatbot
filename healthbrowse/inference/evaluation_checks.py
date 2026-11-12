"""Deterministic format/provenance checks, never a clinical accuracy score."""
import json
import re


def parse_json(text):
    return json.loads(re.sub(r'\s*```$','',re.sub(r'^```(?:json)?\s*','',text)))


def check_output(text, case, truncated=False):
    result={'schema_passed':False,'manual_review_required':True,'clinical_accuracy':'not assessed'}
    if truncated:
        return {**result,'error':'output token limit reached'}
    try:
        value=parse_json(text)
        if case['kind']=='review':
            expected={c['id'] for p in [case['draft']['answer'],*case['draft']['decks']] for c in p['claims']}
            checks=value['checks']
            if len(checks)!=len(expected) or {c['id'] for c in checks}!=expected:
                raise ValueError('reviewer claim IDs do not match')
            if not isinstance(value['questionAnswered'],bool) or any(c['verdict'] not in {'supported','contradicted','insufficient'} for c in checks):
                raise ValueError('invalid reviewer schema')
            supported=value['questionAnswered'] and all(c['verdict']=='supported' for c in checks)
            return {**result,'schema_passed':True,'contract_passed':supported==case['expected_supported']}
        mode=case['input']['mode']
        expected=list(range(1,7)) if mode=='search' else []
        if sorted(d['id'] for d in value['decks'])!=expected:
            raise ValueError('deck IDs do not match the mode')
        sources={s['id']:s for s in case['evidence']['sources']}
        claim_count=0; exact_copies=0
        clean=lambda text:' '.join(text.split())
        for part in [value['answer'],*value['decks']]:
            if not isinstance(part['claims'],list) or len(part['claims'])>(3 if 'id' in part else 4):
                raise ValueError('invalid claim list')
            for claim in part['claims']:
                text=claim['text']
                if not isinstance(text,str) or not text.strip() or len(text)>600 or re.search(
                    r'https?:|\[[^\]]+\]|(?:^|[.!?]\s+)you (?:have|should take|must take)\b|\btake \d|\b\d+(?:\.\d+)?\s*(?:mg|mcg|mL)\b',text,re.I):
                    raise ValueError('invalid or prescriptive claim')
                if not 1<=len(claim['support'])<=3:
                    raise ValueError('missing support')
                for cite in claim['support']:
                    source=sources[cite['id']];quote=cite['quote']
                    if not 20<=len(clean(quote))<=600 or clean(quote) not in clean(source['text']):
                        raise ValueError('quote absent from evidence')
                    if 'id' in part and source.get('deck')!=part['id']:
                        raise ValueError('citation belongs to another deck')
                claim_count+=1
                exact_copies+=int(any(clean(text)==clean(sources[c['id']]['text']) for c in claim['support']))
        if claim_count>22:
            raise ValueError('too many claims')
        available={s['deck'] for s in sources.values() if s.get('deck') and not s.get('overview')}
        populated={d['id'] for d in value['decks'] if d['claims']}
        return {**result,'schema_passed':True,'answer_present':bool(value['answer']['claims']),
                'claim_count':claim_count,'intact_source_copies':exact_copies,
                'populated_decks':sorted(populated),'evidence_decks':sorted(available),
                'unfilled_evidence_decks':sorted(available-populated) if mode=='search' else [],
                'note':'Evidence presence and quote matches do not establish question relevance, correct deck labels, entailment or completeness.'}
    except (ValueError,KeyError,TypeError,AttributeError) as error:
        return {**result,'error':str(error)}
