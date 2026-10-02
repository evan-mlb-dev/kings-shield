import { Component } from '@angular/core';
import { LoadSave } from '../load-save/load-save';
import { LogoApp } from '../logo-app/logo-app';
import { MainNav } from '../main-nav/main-nav';

@Component({
  imports: [LogoApp, MainNav, LoadSave],
  selector: 'app-header',
  styleUrl: './header.scss',
  templateUrl: './header.html',
})
export class Header {}
