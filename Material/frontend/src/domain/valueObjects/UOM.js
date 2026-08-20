// The API accepts exactly these 28 units and rejects anything else with
// "Unrecognized unit of measure". Matching is case-insensitive on the server,
// but we always send the canonical lowercase value.
export const UOM_GROUPS = [
  {
    label: "Count",
    options: [
      { value: "nos", label: "Nos" },
      { value: "pcs", label: "Pieces (pcs)" },
      { value: "set", label: "Set" },
      { value: "pair", label: "Pair" }
    ]
  },
  {
    label: "Weight",
    options: [
      { value: "kg", label: "Kilogram (kg)" },
      { value: "g", label: "Gram (g)" },
      { value: "ton", label: "Ton" },
      { value: "quintal", label: "Quintal" }
    ]
  },
  {
    label: "Length",
    options: [
      { value: "m", label: "Meter (m)" },
      { value: "cm", label: "Centimeter (cm)" },
      { value: "mm", label: "Millimeter (mm)" },
      { value: "ft", label: "Feet (ft)" },
      { value: "inch", label: "Inch" }
    ]
  },
  {
    label: "Area",
    options: [
      { value: "sqm", label: "Square Meter (sqm)" },
      { value: "sqft", label: "Square Feet (sqft)" }
    ]
  },
  {
    label: "Volume",
    options: [
      { value: "cum", label: "Cubic Meter (cum)" },
      { value: "cft", label: "Cubic Feet (cft)" },
      { value: "ltr", label: "Litre (ltr)" },
      { value: "ml", label: "Millilitre (ml)" }
    ]
  },
  {
    label: "Packaging",
    options: [
      { value: "bag", label: "Bag" },
      { value: "box", label: "Box" },
      { value: "bundle", label: "Bundle" },
      { value: "roll", label: "Roll" },
      { value: "sheet", label: "Sheet" },
      { value: "coil", label: "Coil" },
      { value: "pkt", label: "Packet (pkt)" },
      { value: "drum", label: "Drum" },
      { value: "can", label: "Can" }
    ]
  }
];

// The picker is grouped; anything matching a value needs the flat list.
export const UOM_OPTIONS = UOM_GROUPS.flatMap((group) => group.options);
