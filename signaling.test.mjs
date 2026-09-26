import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeInvite, readInvite, theOther, INVITE_KIND } from './signaling.mjs';

const ID = 'a'.repeat(43);          // a base64url token in the valid band
const SDP = 'v=0\r\n' + 'x'.repeat(40);

test('makeInvite accepts a well-formed offer and answer, rejects any other role', () => {
  assert.equal(makeInvite('offer', ID, SDP).ok, true);
  assert.equal(makeInvite('answer', ID, SDP).ok, true);
  assert.equal(makeInvite('sneaky', ID, SDP).ok, false);   // kills the && guard: neither offer nor answer
  const r = makeInvite('offer', ID, SDP);
  assert.equal(r.invite.kind, INVITE_KIND);
  assert.equal(r.invite.role, 'offer');
  assert.equal(r.invite.id, ID);
});

test('id length band is enforced at both boundaries (20..100)', () => {
  assert.equal(makeInvite('offer', 'a'.repeat(20), SDP).ok, true);    // exactly 20 is valid (kills >= → >)
  assert.equal(makeInvite('offer', 'a'.repeat(19), SDP).ok, false);   // 19 too short
  assert.equal(makeInvite('offer', 'a'.repeat(100), SDP).ok, true);   // exactly 100 is valid (kills <= → <)
  assert.equal(makeInvite('offer', 'a'.repeat(101), SDP).ok, false);  // 101 too long
});

test('id must be a base64url token and a string', () => {
  assert.equal(makeInvite('offer', 'has spaces here!!' + 'a'.repeat(30), SDP).ok, false);  // bad chars
  assert.equal(makeInvite('offer', 12345, SDP).ok, false);            // not a string
  assert.equal(makeInvite('offer', null, SDP).ok, false);
});

test('sdp size band is enforced at both boundaries (20..20000)', () => {
  assert.equal(makeInvite('offer', ID, 'x'.repeat(20)).ok, true);     // exactly 20 is valid (kills < → <=)
  assert.equal(makeInvite('offer', ID, 'x'.repeat(19)).ok, false);    // 19 too short
  assert.equal(makeInvite('offer', ID, 'x'.repeat(20000)).ok, true);  // exactly at the cap is valid (kills > → >=)
  assert.equal(makeInvite('offer', ID, 'x'.repeat(20001)).ok, false); // over the cap
  assert.equal(makeInvite('offer', ID, 42).ok, false);                // not a string
});

test('readInvite re-validates a received envelope', () => {
  const good = makeInvite('offer', ID, SDP).invite;
  const r = readInvite(good);
  assert.equal(r.ok, true);
  assert.equal(r.role, 'offer');
  assert.equal(r.id, ID);
  assert.equal(r.sdp, SDP);
  // wrong kind, non-object, and a tampered (oversized) field are all refused
  assert.equal(readInvite({ ...good, kind: 'nope' }).ok, false);
  assert.equal(readInvite(null).ok, false);
  assert.equal(readInvite('a string').ok, false);
  assert.equal(readInvite({ ...good, id: 'x' }).ok, false);           // bad field caught on read
});

test('theOther names the reply role: an offer is answered, an answer is terminal', () => {
  assert.equal(theOther('offer'), 'answer');
  assert.equal(theOther('answer'), '');
  assert.equal(theOther('anything-else'), '');
});
