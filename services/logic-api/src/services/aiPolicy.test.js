import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AiPolicy } from './aiPolicy.js';

describe('Step 16: AiPolicy Suite (One Formula, One Ladder, One Budget)', () => {
  it('should not fire when aiAssistLevel is off', () => {
    const res = AiPolicy.shouldFire({
      stage: 'select',
      aiAssistLevel: 'off',
      topScore: 10,
      secondScore: 0,
      callsUsed: 0
    });
    assert.equal(res.fire, false);
    assert.equal(res.reason, 'ai_assist_off');
  });

  it('should not fire when per-basket budget is exhausted', () => {
    const res = AiPolicy.shouldFire({
      stage: 'select',
      aiAssistLevel: 'balanced',
      topScore: 10,
      secondScore: 0,
      callsUsed: 25,
      maxCalls: 25
    });
    assert.equal(res.fire, false);
    assert.equal(res.reason, 'budget_exhausted');
  });

  it('should not fire on confident unambiguous matches in balanced mode', () => {
    const res = AiPolicy.shouldFire({
      stage: 'select',
      aiAssistLevel: 'balanced',
      topScore: 95,
      secondScore: 20,
      callsUsed: 0,
      maxCalls: 25
    });
    assert.equal(res.fire, false);
    assert.equal(res.reason, 'confident_unambiguous_match');
  });

  it('should fire on near-ties (topScore - secondScore < 8) in balanced mode', () => {
    const res = AiPolicy.shouldFire({
      stage: 'select',
      aiAssistLevel: 'balanced',
      topScore: 70,
      secondScore: 68,
      callsUsed: 0,
      maxCalls: 25
    });
    assert.equal(res.fire, true);
    assert.equal(res.reason, 'near_tie');
  });

  it('should fire on low confidence (topScore < 65) in balanced mode', () => {
    const res = AiPolicy.shouldFire({
      stage: 'select',
      aiAssistLevel: 'balanced',
      topScore: 50,
      secondScore: 30,
      callsUsed: 0,
      maxCalls: 25
    });
    assert.equal(res.fire, true);
    assert.equal(res.reason, 'low_confidence_match');
  });

  it('should respect economy assist level (fires only when no result would be produced)', () => {
    const withResult = AiPolicy.shouldFire({
      stage: 'select',
      aiAssistLevel: 'economy',
      topScore: 45,
      secondScore: 30,
      hasNoResult: false
    });
    assert.equal(withResult.fire, false);
    assert.equal(withResult.reason, 'economy_has_result');

    const noResult = AiPolicy.shouldFire({
      stage: 'select',
      aiAssistLevel: 'economy',
      topScore: 0,
      hasNoResult: true
    });
    assert.equal(noResult.fire, true);
    assert.equal(noResult.reason, 'economy_no_result');
  });

  it('should verify high-value items in thorough assist level', () => {
    const highVal = AiPolicy.shouldFire({
      stage: 'select',
      aiAssistLevel: 'thorough',
      topScore: 90,
      secondScore: 20,
      isHighValue: true
    });
    assert.equal(highVal.fire, true);
    assert.equal(highVal.reason, 'thorough_high_value_verification');
  });

  it('should respect per-stage disabled toggles', () => {
    const res = AiPolicy.shouldFire({
      stage: 'query',
      aiAssistLevel: 'balanced',
      aiStages: { interpret: true, query: false, select: true },
      ambiguous: true
    });
    assert.equal(res.fire, false);
    assert.equal(res.reason, 'stage_disabled');
  });
});
