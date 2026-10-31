const SECTION_SIZE = 0x1000;
const SECTIONS_PER_BLOCK = 14;
const BLOCK_SIZE = SECTIONS_PER_BLOCK * SECTION_SIZE;
const ID_OFFSET = 0xff4;
const CHECKSUM_OFFSET = 0xff6;
const SIGNATURE_OFFSET = 0xff8;
const INDEX_OFFSET = 0xffc;
const SIGNATURE = 0x08012025;
const MIN_SAVE_SIZE = 2 * BLOCK_SIZE;

const SECTION_13_SIZES = Array.from({ length: (0x52c - 0x450) / 4 + 1 }, (_, i) => 0x450 + i * 4);

const CHECKSUM_SIZES: Readonly<Record<number, readonly number[]>> = {
  0: [0xf24],
  1: [0xff0, 0xf80],
  2: [0xff0, 0xf80],
  3: [0xff0, 0xf80],
  4: [0xd98],
  5: [0xf80, 0xff0],
  6: [0xf80, 0xff0],
  7: [0xf80, 0xff0],
  8: [0xf80, 0xff0],
  9: [0xf80, 0xff0],
  10: [0xf80, 0xff0],
  11: [0xf80, 0xff0],
  12: [0xf80, 0xff0],
  13: SECTION_13_SIZES,
};

export function sectionChecksum(view: DataView, offset: number, size: number): number {
  let sum = 0;
  for (let i = 0; i < size; i += 4) sum = (sum + view.getUint32(offset + i, true)) >>> 0;
  return ((sum >>> 16) + (sum & 0xffff)) & 0xffff;
}

export type SaveOpenResult = { ok: true; editor: SaveFileWriter } | { ok: false; reason: string };

export class SaveFileWriter {
  readonly bytes: Uint8Array;
  readonly view: DataView;

  private constructor(
    bytes: Uint8Array,
    /** Section ID -> offset in the file, for the active block */
    readonly sections: ReadonlyMap<number, number>,
    private readonly checksumSizes: ReadonlyMap<number, number>,
  ) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  static open(original: Uint8Array): SaveOpenResult {
    if (original.length < MIN_SAVE_SIZE) {
      return { ok: false, reason: 'This file is too small to be a Radical Red save.' };
    }
    const bytes = original.slice();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const sections = activeSections(view);
    if (!sections) {
      return { ok: false, reason: 'No complete save block found in this file.' };
    }

    const sizes = new Map<number, number>();
    for (const [id, offset] of sections) {
      const stored = view.getUint16(offset + CHECKSUM_OFFSET, true);
      const size = (CHECKSUM_SIZES[id] ?? []).find(
        (s) => sectionChecksum(view, offset, s) === stored,
      );
      if (size === undefined) {
        return {
          ok: false,
          reason: `Section ${id} has a checksum this editor does not understand: editing is disabled to protect the save.`,
        };
      }
      sizes.set(id, size);
    }
    return { ok: true, editor: new SaveFileWriter(bytes, sections, sizes) };
  }

  /** Offset in the file of a section of the active block */
  sectionOffset(id: number): number {
    const offset = this.sections.get(id);
    if (offset === undefined) throw new Error(`Section ${id} not found`);
    return offset;
  }

  updateChecksums(): void {
    for (const [id, offset] of this.sections) {
      const size = this.checksumSizes.get(id)!;
      this.view.setUint16(offset + CHECKSUM_OFFSET, sectionChecksum(this.view, offset, size), true);
    }
  }

  toBytes(): Uint8Array {
    this.updateChecksums();
    return this.bytes.slice();
  }
}

function activeSections(view: DataView): Map<number, number> | null {
  let best: { index: number; sections: Map<number, number> } | null = null;
  for (let block = 0; block < 2; block++) {
    const sections = new Map<number, number>();
    let index = 0;
    for (let i = 0; i < SECTIONS_PER_BLOCK; i++) {
      const offset = block * BLOCK_SIZE + i * SECTION_SIZE;
      const id = view.getUint16(offset + ID_OFFSET, true);
      if (view.getUint32(offset + SIGNATURE_OFFSET, true) !== SIGNATURE) continue;
      if (id >= SECTIONS_PER_BLOCK) continue;
      sections.set(id, offset);
      index = view.getUint32(offset + INDEX_OFFSET, true);
    }
    if (sections.size !== SECTIONS_PER_BLOCK) continue;
    if (!best || index > best.index) best = { index, sections };
  }
  return best?.sections ?? null;
}
