import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../src/api/errors.ts';

test('technical validation details in a field are classified as service faults', () => {
  const error = new ApiError('validation', 'Validation failed.', 422, {
    email: ['SQLSTATE[synthetic]: Exception in /synthetic/Validator.php:42'],
  });
  assert.equal(error.isTechnical, true);
  assert.equal(error.isServiceFault, true);
});

test('ordinary validation wording remains available to the form', () => {
  const error = new ApiError('validation', 'Validation failed.', 422, {
    email: ['Please enter a valid email address.'],
  });
  assert.equal(error.isTechnical, false);
  assert.equal(error.fieldError('email'), 'Please enter a valid email address.');
});
