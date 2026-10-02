import { Component, inject } from '@angular/core';
import { SaveFileParser } from '../../services/save-file-parser';
import { GameStateService } from '../../states/game-state';

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
  private gameState = inject(GameStateService);

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
          }
        } catch (error) {
          console.error('Erreur lors du traitement du fichier .sav :', error);
        }
      };

      reader.readAsArrayBuffer(file);
    }
  }
}
