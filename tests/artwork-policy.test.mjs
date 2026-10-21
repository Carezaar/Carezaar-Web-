import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('../public/', import.meta.url);
const src = (f) => fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');

// SHA-256 of every people artwork file removed in 1d5b98a ("Update app artwork").
// None of these bytes may come back under any name.
const REMOVED_PEOPLE_ARTWORK = new Set([
  "926509b8b68d0fdfe0c22fd4ac1ec69726646ba1c39a7aa6ef0e527b136f9c54", // public/app-assets/bg_intro.webp
  "31df4e2fd4a95b477f197052e9c104e20227c2fe6fc316970b98c287729e8a14", // public/app-assets/client_adult.webp
  "0003ff47d50f969de5f9c65fa92624d5a165461c1e62482bbb42f857a0a01e23", // public/app-assets/client_child.webp
  "eac2aaae8a6bd47cd67f0c25e0c99be2a5c391ee944f366c7a8c6aab63a9c623", // public/app-assets/client_pregnancy.webp
  "82b442cb341bd923e70eadf50e9461fe7ab0fb3ad914ae6c7382b12e551dc00a", // public/app-assets/client_senior.webp
  "a4974815e0964777961284016f67871d9f8c4b261999a3e06d135ca7a158b583", // public/app-assets/header_adult.webp
  "c5f9556caea46f2bb007d7416026791d535cc57a786be121489491c5a2868b37", // public/app-assets/header_child.webp
  "120a8df43ce88b9ef660ae2a1c2c5ab9c07bf73621a016fc8f43a3ea067e434f", // public/app-assets/header_pregnancy.webp
  "62f6436f20558099bff5e1b1b5a116b6d980db81f7e4ef34f9d56afcb7199c14", // public/app-assets/header_senior.webp
  "851e99a199d6ee7b2c1b27eb2741495d3180c503b61c20698edb191f755b4b6f", // public/app-assets/ic_caregiver.svg
  "6d128f42546823c3c8f82734b0a9b487e6008795bf55e9f2fd8c5d29fe7adbce", // public/app-assets/ic_client.svg
  "c45e51686d57ec178d73e62d03107d2b513af20c065ff95216c33397cb154175", // public/app-assets/ic_condition_assessment.svg
  "8f9a6076b7c80a95c94678cf8f463645de06edcee1ec3a1be257adcc36317711", // public/app-assets/ic_condition_babysitting_nanny.svg
  "c6c9be619a49e785711658578072812f3d165820b9f6031e2d2c6141ea77bde2", // public/app-assets/ic_condition_companionship.svg
  "0eba941301503a16fb3c5267b10e00b3218cf93b4b84443a8222299b127c5594", // public/app-assets/ic_condition_feeding.svg
  "f94768e0910d4a704b8cdd891ed194933196bfc467f185213617c911314e877e", // public/app-assets/ic_condition_overnight_care.svg
  "1b8060f9391852af981dea385325ecf7e2ec545008bda4d3bd608cb657a2e634", // public/app-assets/ic_condition_personal_care.svg
  "dad23d46b09dd2896a7e74e2d5c74b940fcf6c58ac92c06d58fa6b73cc4b2614", // public/app-assets/ic_condition_wound.svg
  "ca5952fec34f2d86779a6d043ec6e523380a3950a89f0a448670ac84e1f0e868", // public/app-assets/ic_shift_afternoon.svg
  "174b7ea238b9aebc653a533488eeaa9f6fdb6a93ed925f1f21e364be8d66960a", // public/app-assets/ic_shift_evening.svg
  "c606ef37fe48ef5b8247cf741e47c8d805a5fe6d2470fd15adb501eec57a3957", // public/app-assets/ic_shift_morning.svg
  "b23116945412f95950825d5566e61afc56d0c14abe12c1b049e85cefbf2622b3", // public/app-assets/ic_special_calm.svg
  "2efe180fc6308c7fab3127a8b99623d416ccfc28d3f83f9b732f32dc7f1de9b3", // public/app-assets/ic_special_compassionate.svg
  "b3c66ed269e34da2f728282a5c2613dc73c36c61818b913dee13bef5007cb7e7", // public/app-assets/ic_special_culturally_aware.svg
  "bf6687f78627bf726492b7e36d1b18cb68aa5bcd0f8b4452dd09226fdaaff7b9", // public/app-assets/ic_special_driver.svg
  "1d8a3061b37cc6877ad55f741c6ce428f98522252efd1a5fb36d929c59850794", // public/app-assets/ic_special_good_communicator.svg
  "26a6460a510d7213a40e04e4de0195415a3b5cbb5fc5b0eb24f115aee1d8c036", // public/app-assets/ic_special_pet_friendly.svg
  "e25ff7459539263093058394be669863168426a3eb59a55571acf18fca482bc5", // public/app-assets/ic_special_respectful.svg
  "97010a9ba2a9ad347c87c49299c5140767bf8585a9eababe0322eb4ff01df3b7", // public/app-assets/ic_support.svg
  "495d813b5c4d27de04acb9e94959d26e0af3dcbc2592aedaa5cf8c68840bd361", // public/assets/2c0c41de4775bed358fedceb4f03ba6bd2b76913.png
  "4473580fe5c84fbb36afe269929897605aae5f3c54a9db1a64aab66026e79a7c", // public/assets/80e754df1acd580e680f27c317c16f17a8ffb0eb.png
  "e3a16af9f82cb83af9ea150527847f2ad6d68ef4a77d470d5c965deea9eee0fe", // public/assets/92bf103484e337567f379617f79c6c37ba10484d.jpg
  "7c5b7c70996db543f785a8f5abe685a19bab75785ef4c1b7d23a196fc12df941", // public/assets/b8a5332565873bf014bb9feaf8faef4b797407fe.png
  "e7cb6fd0c8a4f4081c243e6df919724c2668cd992b1dd8cf1a86f6b4ee700066", // public/assets/desktop-signin-photo.jpg
  "efc11e64286d1932c8821e76487778e9102d48b4d7d4d6676824e2a1b37e3353", // public/assets/mobile-match-skills-illustration.png
  "75c271a4f51a002c9f08a4beaf217c2feb710cb94fe4719d430ddba9607e5468", // public/og-image.jpg
]);

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

test('none of the removed people artwork is shipped, under any name', () => {
  for (const file of files(fileURLToPath(root))) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(REMOVED_PEOPLE_ARTWORK.has(hash), false, 'Removed people artwork shipped again: ' + file);
  }
});

test('people-free replacements exist under the names the server and scenes use', () => {
  const names = ['bg_intro', 'bg_profile', 'client_adult', 'client_child', 'client_pregnancy', 'client_senior',
    'header_adult', 'header_child', 'header_pregnancy', 'header_senior', 'header_messages'].map((n) => 'app-assets/' + n + '.webp')
    .concat(['ic_caregiver', 'ic_client', 'ic_condition_assessment', 'ic_condition_babysitting_nanny', 'ic_condition_companionship',
      'ic_condition_feeding', 'ic_condition_overnight_care', 'ic_condition_personal_care', 'ic_condition_wound', 'ic_shift_afternoon',
      'ic_shift_evening', 'ic_shift_morning', 'ic_special_calm', 'ic_special_compassionate', 'ic_special_culturally_aware',
      'ic_special_driver', 'ic_special_good_communicator', 'ic_special_pet_friendly', 'ic_special_respectful', 'ic_support', 'ic_user']
      .map((n) => 'app-assets/' + n + '.svg'))
    .concat(['welcome-hands.jpg', 'signin-hands-tea.jpg', 'skills-illustration.png', 'care-type-senior.png', 'care-type-child.png', 'care-type-pregnancy.png']
      .map((n) => 'assets/' + n));
  for (const name of names) assert.ok(fs.existsSync(new URL(name, root)), name);
});

test('replacement icons are plain filled paths', () => {
  for (const file of files(fileURLToPath(new URL('app-assets/', root))).filter((f) => f.endsWith('.svg'))) {
    const svg = fs.readFileSync(file, 'utf8').toLowerCase();
    for (const banned of ['<script', '<image', '<text', '<foreignobject', 'href=']) assert.equal(svg.includes(banned), false, path.basename(file) + ': ' + banned);
  }
});

test('screens use the replacements, not a blank or the old pictures', () => {
  const icon = src('ui/Icon.tsx');
  assert.match(icon, /"92bf103484e337567f379617f79c6c37ba10484d\.jpg": "welcome-hands\.jpg"/);
  assert.match(icon, /"2c0c41de4775bed358fedceb4f03ba6bd2b76913\.png": "care-type-senior\.png"/);
  assert.match(icon, /"80e754df1acd580e680f27c317c16f17a8ffb0eb\.png": "care-type-child\.png"/);
  assert.match(icon, /"b8a5332565873bf014bb9feaf8faef4b797407fe\.png": "care-type-pregnancy\.png"/);
  assert.doesNotMatch(icon, /OMITTED/);
  for (const [, file] of icon.matchAll(/: "([\w.-]+\.(?:jpg|png))"/g)) assert.ok(fs.existsSync(new URL('assets/' + file, root)), file);
  assert.match(src('ui/frames.tsx'), /\/assets\/signin-hands-tea\.jpg/);
  assert.match(src('screens/wizardParts.tsx'), /\/assets\/skills-illustration\.png/);
  const main = src('screens/main.tsx');
  assert.match(main, /replace\("client_", "header_"\)/);
  assert.match(main, /icon: "ic_support"/);
});
