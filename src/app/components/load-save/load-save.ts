import { Component, inject } from '@angular/core';
import { Analytics } from '../../services/analytics';
import { SaveFileParser } from '../../services/save-file-parser';
import { GameStateService } from '../../states/game-state';
import { SaveBytesState } from '../../states/save-bytes';

@Component({
  selector: 'app-load-save',
  imports: [],
  templateUrl: './load-save.html',
  styleUrl: './load-save.scss',
})
export class LoadSave {
  // services
  private saveFileParser = inject(SaveFileParser);
  // states
  protected gameState = inject(GameStateService);
  private saveBytes = inject(SaveBytesState);
  private analytics = inject(Analytics);

  onFileSelected(event: any): void {
    const file: File = event.target.files[0];
    // The same file can be picked again
    event.target.value = '';
    if (file) {
      const reader = new FileReader();

      reader.onload = (e: any) => {
        try {
          const arrayBuffer = e.target.result;
          const parseResult = this.saveFileParser.parseSaveFile(arrayBuffer);

          console.debug(parseResult);

          if (!parseResult) {
            alert(`${file.name} is not a Radical Red save. Pick the .sav file of your emulator.`);
            return;
          }
          this.gameState.setSaveName(file.name);
          this.gameState.setPkmnData(parseResult);
          // Kept byte for byte for the Save Editor
          this.saveBytes.set(new Uint8Array(arrayBuffer));
          this.analytics.event('save-loaded');
        } catch (error) {
          console.error('Error while processing the .sav file:', error);
          alert(`${file.name} could not be read.`);
        }
      };

      reader.readAsArrayBuffer(file);
    }
  }
}
