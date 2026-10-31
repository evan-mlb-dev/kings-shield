import { Component, inject } from '@angular/core';
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

  onFileSelected(event: any): void {
    const file: File = event.target.files[0];
    if (file) {
      this.gameState.setSaveName(file.name);
      const reader = new FileReader();

      reader.onload = (e: any) => {
        try {
          const arrayBuffer = e.target.result;
          const parseResult = this.saveFileParser.parseSaveFile(arrayBuffer);

          console.debug(parseResult);

          if (parseResult) {
            this.gameState.setPkmnData(parseResult);
            // Kept byte for byte for the Save Editor
            this.saveBytes.set(new Uint8Array(arrayBuffer));
          }
        } catch (error) {
          console.error('Error while processing the .sav file:', error);
        }
      };

      reader.readAsArrayBuffer(file);
    }
  }
}
