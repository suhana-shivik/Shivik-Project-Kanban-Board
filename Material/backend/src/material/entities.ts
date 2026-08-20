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
