import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('../public/', import.meta.url);

test('intentional people-artwork removals stay out of public resources', () => {
  const removed = ['bg_intro', 'client_adult', 'client_child', 'client_pregnancy', 'client_senior', 'header_adult', 'header_child', 'header_pregnancy', 'header_senior', 'ic_caregiver', 'ic_client', 'ic_condition_assessment', 'ic_condition_babysitting_nanny', 'ic_condition_companionship', 'ic_condition_feeding', 'ic_condition_overnight_care', 'ic_condition_personal_care', 'ic_condition_wound', 'ic_shift_afternoon', 'ic_shift_evening', 'ic_shift_morning', 'ic_special_calm', 'ic_special_compassionate', 'ic_special_culturally_aware', 'ic_special_driver', 'ic_special_good_communicator', 'ic_special_pet_friendly', 'ic_special_respectful', 'ic_support'];
  for (const name of removed) for (const ext of ['webp','svg']) {
    assert.equal(fs.existsSync(new URL(`app-assets/${name}.${ext}`, root)), false, `Removed people artwork: ${name}.${ext}`);
  }
  for (const name of ['92bf103484e337567f379617f79c6c37ba10484d.jpg','2c0c41de4775bed358fedceb4f03ba6bd2b76913.png','80e754df1acd580e680f27c317c16f17a8ffb0eb.png','b8a5332565873bf014bb9feaf8faef4b797407fe.png','desktop-signin-photo.jpg','mobile-match-skills-illustration.png']) {
    assert.equal(fs.existsSync(new URL('assets/' + name, root)), false, `Removed scene artwork: ${name}`);
  }
});

test('hands-only Messages, room replacement and faceless outline remain available', () => {
  for (const name of ['app-assets/header_messages.webp','assets/intro-room.jpg','app-assets/ic_user.svg']) {
    assert.ok(fs.existsSync(new URL(name, root)), path.basename(name));
  }
});
