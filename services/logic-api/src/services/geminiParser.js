/**
 * Backward-compatible re-export for DomParser
 */
import { DomParser, parseMetricSize, normalizeSupermarket, assignCategory } from './domParser.js';

const GeminiDomParser = DomParser;
const DomScraperParser = DomParser;

export {
  DomParser,
  GeminiDomParser,
  DomScraperParser,
  parseMetricSize,
  normalizeSupermarket,
  assignCategory
};
