import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SaveFileParser } from './save-file-parser';
import { sectionChecksum, SaveFileWriter } from './save-file-writer';

const SAVE_PATH = resolve(process.cwd(), 'test-data/radical-red.sav');
const hasSave = existsSync(SAVE_PATH);

function loadSave(): Uint8Array {
  return new Uint8Array(readFileSync(SAVE_PATH));
}

function open(bytes: Uint8Array): SaveFileWriter {
  const result = SaveFileWriter.open(bytes);
  if (!result.ok) throw new Error(result.reason);
  return result.editor;
}

describe.skipIf(!hasSave)('SaveFileWriter (real save)', () => {
  it('understands every checksum of the active block', () => {
    expect(SaveFileWriter.open(loadSave()).ok).toBe(true);
  });

  it('writes back exactly the same bytes when nothing is edited', () => {
    const original = loadSave();
    const written = open(original).toBytes();
    expect(written.length).toBe(original.length);
    expect(Buffer.from(written).equals(Buffer.from(original))).toBe(true);
  });

  it('never touches the original bytes', () => {
    const original = loadSave();
    const copy = original.slice();
    const editor = open(original);
    editor.bytes[editor.sectionOffset(1) + 0x40] ^= 0xff;
    editor.toBytes();
    expect(Buffer.from(original).equals(Buffer.from(copy))).toBe(true);
  });

  it('updates the checksum of an edited section, and the result opens and parses again', () => {
    const editor = open(loadSave());
    const party = editor.sectionOffset(1);
    const before = editor.view.getUint16(party + 0xff6, true);
    // First party Pokémon, friendship byte (plain party data in Radical Red)
    editor.bytes[party + 0x38 + 0x20 + 9] ^= 0x01;
    const written = editor.toBytes();

    const reopened = SaveFileWriter.open(written);
    expect(reopened.ok).toBe(true);
    const view = new DataView(written.buffer);
    expect(view.getUint16(party + 0xff6, true)).not.toBe(before);
    expect(view.getUint16(party + 0xff6, true)).toBe(sectionChecksum(view, party, 0xff0));
    expect(new SaveFileParser().parseSaveFile(written.slice().buffer)?.team.length).toBeGreaterThan(
      0,
    );
  });

  it('refuses a save whose checksum it cannot explain', () => {
    const bytes = loadSave();
    const editor = open(bytes);
    const offset = editor.sectionOffset(1);
    // Corrupt the stored checksum of the original
    bytes[offset + 0xff6] ^= 0xff;
    const result = SaveFileWriter.open(bytes);
    expect(result.ok).toBe(false);
  });
});

describe('SaveFileWriter', () => {
  it('refuses a file too small to be a save', () => {
    expect(SaveFileWriter.open(new Uint8Array(1024)).ok).toBe(false);
  });
});
