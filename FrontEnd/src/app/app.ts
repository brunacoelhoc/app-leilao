import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Acessibilidade } from './shared/acessibilidade/acessibilidade';
import { Footer } from './shared/footer/footer';
import { Sidebar } from './shared/sidebar/sidebar';

@Component({
  imports: [RouterOutlet, Acessibilidade, Sidebar, Footer],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {}
