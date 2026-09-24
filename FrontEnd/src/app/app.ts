import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Acessibilidade } from './shared/acessibilidade/acessibilidade';
import { Footer } from './shared/footer/footer';
import { LoginNecessarioPopup } from './shared/login-necessario/login-necessario';
import { Sidebar } from './shared/sidebar/sidebar';

@Component({
  imports: [RouterOutlet, Acessibilidade, Sidebar, Footer, LoginNecessarioPopup],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {}
