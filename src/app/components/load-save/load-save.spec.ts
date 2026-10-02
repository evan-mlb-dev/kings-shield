import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoadSave } from './load-save';

describe('LoadSave', () => {
  let component: LoadSave;
  let fixture: ComponentFixture<LoadSave>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadSave],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadSave);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
