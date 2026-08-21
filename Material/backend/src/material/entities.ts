import type { Status } from '../common/types';

export type { Status };

export interface Category {
  id: number;
  code: string | null;
  name: string;
  description: string | null;
  status: Status;
}

export interface Subcategory extends Category {
  categoryId: number;
  /** null when it sits directly under its category rather than another sub-category. */
  parentId: number | null;
}

export interface Material {
  id: number;
  code: string;
  name: string;
  categoryId: number;
  /** null when the material sits directly under its category. */
  subcategoryId: number | null;
  uom: string;
  hsn: string;
  gst: string;
  description: string | null;
  status: Status;
}

/** Parent names are resolved at read time rather than stored on the record. */
export interface SubcategoryView extends Subcategory {
  categoryName: string | null;
  parentName: string | null;
  /** 1 for a sub-category sitting directly under its category. */
  depth: number;
  /** Category name first, then every ancestor down to this record. */
  path: string[];
}

export interface MaterialView extends Material {
  categoryName: string | null;
  subcategoryName: string | null;
}

/** One quantity drawn against a material — the raw rows behind the report. */
export interface MaterialConsumption {
  id: number;
  materialId: number;
  quantity: number;
  /** The calendar date of the draw, as YYYY-MM-DD. */
  consumedOn: string;
  note: string | null;
}

/** Material and category names resolved at read time, like MaterialView. */
export interface MaterialConsumptionView extends MaterialConsumption {
  materialCode: string;
  materialName: string;
  uom: string;
  categoryId: number;
  categoryName: string | null;
}

/** One material's total for the month. */
export interface ConsumptionReportLine {
  materialId: number;
  code: string;
  name: string;
  uom: string;
  quantity: number;
  /** How many individual draws make up the total. */
  entries: number;
}

/** kg and bags cannot be added together, so subtotals are kept per unit. */
export interface UomSubtotal {
  uom: string;
  quantity: number;
}

export interface ConsumptionReportCategory {
  categoryId: number;
  categoryName: string;
  lines: ConsumptionReportLine[];
  totalsByUom: UomSubtotal[];
}

/** What the report endpoints return — the PDF is this, typeset. */
export interface ConsumptionReport {
  /** YYYY-MM */
  month: string;
  /** "January 2025" — what the PDF header prints. */
  monthLabel: string;
  generatedAt: string;
  totalEntries: number;
  categories: ConsumptionReportCategory[];
}
