import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KeywordExtractor } from './keywordExtractor.js';

describe('KeywordExtractor', () => {
  it('should extract clean food nouns and drop numeric tokens & stopwords', () => {
    const item = {
      name: 'Walnuts 200 g',
      baseItem: 'Walnuts'
    };
    const kws = KeywordExtractor.extractKeywords(item);
    assert.deepEqual(kws, ['walnuts']);
  });

  it('should drop packaging stopwords and liquids', () => {
    const item = {
      name: 'Butter beans in water 2 x 400 g',
      baseItem: 'Butter beans in water'
    };
    const kws = KeywordExtractor.extractKeywords(item);
    assert.deepEqual(kws, ['butter', 'beans']);
  });

  it('should detect valid noun evidence matching singular or plural stem', () => {
    const keywords = ['tomatoes', 'puree'];
    assert.equal(KeywordExtractor.hasNounEvidence(keywords, 'Tesco Tomato Puree 200g'), true);
    assert.equal(KeywordExtractor.hasNounEvidence(keywords, 'ASDA Chopped Tomatoes in Juice 400g'), true);
    assert.equal(KeywordExtractor.hasNounEvidence(keywords, 'Sainsbury Baby Spinach 250g'), false);
  });

  it('should extract alternateTerms into keywords for multi-fruit or alternative items', () => {
    const item = {
      name: 'Plums',
      baseItem: 'Plums or pears',
      alternateTerms: ['pears']
    };
    const kws = KeywordExtractor.extractKeywords(item);
    assert.deepEqual(kws, ['plums', 'pears']);
    assert.equal(KeywordExtractor.hasNounEvidence(kws, 'Tesco Conference Pears 600g'), true);
  });

  it('should resolve UK nameVariants bidirectionally in noun evidence', () => {
    // Hummus -> Houmous (shopping list to UK retailer spelling)
    assert.equal(KeywordExtractor.hasNounEvidence(['hummus'], 'Tesco Houmous 200g'), true);
    assert.equal(KeywordExtractor.hasNounEvidence(['houmous'], 'Sainsburys Hummus 200g'), true);
    assert.equal(KeywordExtractor.hasNounEvidence(['hummus'], 'Tesco Beef Steak Mince 500g'), false);

    // Yogurt -> Yoghurt
    assert.equal(KeywordExtractor.hasNounEvidence(['yogurt'], 'Alpro Greek Style Plain Dairy Free Yoghurt Alternative 400g'), true);
    assert.equal(KeywordExtractor.hasNounEvidence(['yoghurt'], 'Tesco Greek Style Yogurt 500G'), true);
  });
});
