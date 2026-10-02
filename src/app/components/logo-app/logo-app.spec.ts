import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LogoApp } from './logo-app';

describe('LogoApp', () => {
  let component: LogoApp;
  let fixture: ComponentFixture<LogoApp>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LogoApp],
    }).compileComponents();

    fixture = TestBed.createComponent(LogoApp);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
