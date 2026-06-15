import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareField, buildResults, overallVerdict, GOV_WARNING, EMPTY_DECLARED } from '../src/lib/compare.js';

test('exact match passes', () => {
  assert.equal(compareField('750 mL', '750 mL', 'net_contents').status, 'pass');
});

test("Dave's nuance: case + apostrophe differences still pass", () => {
  // "STONE'S THROW" on the label vs "Stone's Throw" in the application.
  assert.equal(compareField("STONE'S THROW", "Stone's Throw", 'brand_name').status, 'pass');
});

test('punctuation-only differences pass', () => {
  assert.equal(compareField('45% Alc./Vol.', '45% alc/vol', 'alcohol_content').status, 'pass');
});

test('partial overlap is a soft review, not a hard fail', () => {
  assert.equal(compareField('Old Tom Distillery Co.', 'Old Tom Distillery', 'producer_name').status, 'warn');
});

test('genuine mismatch fails', () => {
  assert.equal(compareField('Bourbon', 'Vodka', 'class_type').status, 'fail');
});

test('field on application but absent from label is flagged missing', () => {
  assert.equal(compareField(null, '750 mL', 'net_contents').status, 'missing');
});

test('government warning: exact standard text passes', () => {
  assert.equal(compareField(GOV_WARNING, '', 'government_warning').status, 'pass');
});

test('government warning: present but reworded triggers manual review', () => {
  const reworded = 'GOVERNMENT WARNING: Per the Surgeon General, do not drink while pregnant. Alcohol impairs driving.';
  assert.equal(compareField(reworded, '', 'government_warning').status, 'warn');
});

test('government warning: missing fails', () => {
  assert.equal(compareField('Brewed and bottled in Vermont', '', 'government_warning').status, 'fail');
});

test('overall verdict is REJECTED when any required field fails', () => {
  const extracted = {
    brand_name: 'Vodka', class_type: 'Vodka', alcohol_content: '40%', net_contents: '750 mL',
    producer_name: 'X', producer_address: null, country_of_origin: null,
    government_warning: null, government_warning_formatting: {}
  };
  const declared = { ...EMPTY_DECLARED, brand_name: 'Whiskey' };
  assert.equal(overallVerdict(buildResults(extracted, declared)), 'fail');
});
