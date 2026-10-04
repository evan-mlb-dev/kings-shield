import { Component } from '@angular/core';

@Component({
  selector: 'app-type-chart-page',
  template: `
    <section class="type-chart">
      <h1>Type Chart</h1>
      <p>An interactive type chart is coming soon.</p>
    </section>
  `,
  styles: `
    .type-chart {
      max-width: 1440px;
      padding: 40px 20px;
      margin: 0 auto;
      text-align: center;
    }

    h1 {
      margin-bottom: 12px;
      font-size: 1.6rem;
    }

    p {
      opacity: 0.6;
    }
  `,
})
export class TypeChartPage {}
