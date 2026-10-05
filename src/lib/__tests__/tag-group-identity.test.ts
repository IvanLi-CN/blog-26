import { expect, it } from "bun:test";
import { resolveTagGroupIdentities } from "@/lib/tag-group-identity";

it("keeps I²C, I2C, internal spaces and canonical case distinct in AI grouping", () => {
  const names = ["I²C", "I2C", "USB-C PD + PPS", "React"];
  expect(
    resolveTagGroupIdentities([{ key: "bus", title: "Bus", tags: ["I²C", "I2C"] }], names)
  ).toEqual([
    { key: "bus", title: "Bus", tags: ["I²C", "I2C"] },
    { key: "unassigned", title: "Unassigned", tags: ["USB-C PD + PPS", "React"] },
  ]);
  for (const altered of ["I2C", "react", "USB-CPD+PPS"]) {
    expect(() =>
      resolveTagGroupIdentities(
        [{ key: "bad", title: "Bad", tags: [altered] }],
        ["I²C", "React", "USB-C PD + PPS"]
      )
    ).toThrow("Tag not found");
  }
  expect(() =>
    resolveTagGroupIdentities([{ key: "bus", title: "Bus", tags: ["I²C", " I²C "] }], names)
  ).toThrow("Tag duplicated");
});
