import type {
  IBankParser,
  RawSmsMessage,
  ExtractedTransaction,
  ClassificationResult,
} from '@/modules/sms/types';
import { HdfcParser } from './banks/hdfcParser';
import { IciciParser } from './banks/iciciParser';
import { SbiParser } from './banks/sbiParser';
import { AxisParser } from './banks/axisParser';
import { KotakParser } from './banks/kotakParser';
import { IdfcParser } from './banks/idfcParser';
import { AuBankParser } from './banks/auBankParser';
import { FederalBankParser } from './banks/federalBankParser';
import { IndusindParser } from './banks/indusindParser';
import { CanaraParser } from './banks/canaraParser';
import { BobParser } from './banks/bobParser';
import { GenericBankParser } from './banks/genericBankParser';

export class ParserRegistry {
  private static parsers: IBankParser[] = [
    new HdfcParser(),
    new IciciParser(),
    new SbiParser(),
    new AxisParser(),
    new KotakParser(),
    new IdfcParser(),
    new AuBankParser(),
    new FederalBankParser(),
    new IndusindParser(),
    new CanaraParser(),
    new BobParser(),
  ];

  private static fallbackParser: IBankParser = new GenericBankParser();

  /**
   * Register a custom or newly supported bank parser.
   */
  public static register(parser: IBankParser): void {
    // Avoid duplicate registration of the same bankId
    const existingIndex = this.parsers.findIndex((p) => p.bankId === parser.bankId);
    if (existingIndex >= 0) {
      this.parsers[existingIndex] = parser;
    } else {
      this.parsers.unshift(parser); // Custom parsers take priority
    }
  }

  /**
   * Find the matching bank parser for an SMS, or return the generic fallback.
   */
  public static findParser(message: RawSmsMessage): IBankParser {
    for (const parser of this.parsers) {
      if (parser.canHandle(message)) {
        return parser;
      }
    }
    return this.fallbackParser;
  }

  /**
   * Parse a raw SMS using the best matching bank parser.
   */
  public static parse(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const parser = this.findParser(message);
    const result = parser.parse(message, classification);

    if (result) {
      return result;
    }

    // If specific bank parser failed to parse, try generic fallback
    if (parser !== this.fallbackParser) {
      return this.fallbackParser.parse(message, classification);
    }

    return null;
  }

  /**
   * Get all registered bank parsers.
   */
  public static getRegisteredParsers(): IBankParser[] {
    return [...this.parsers];
  }

  /**
   * Reset parser list to defaults.
   */
  public static resetDefaults(): void {
    this.parsers = [
      new HdfcParser(),
      new IciciParser(),
      new SbiParser(),
      new AxisParser(),
      new KotakParser(),
      new IdfcParser(),
      new AuBankParser(),
      new FederalBankParser(),
      new IndusindParser(),
      new CanaraParser(),
      new BobParser(),
    ];
  }
}
