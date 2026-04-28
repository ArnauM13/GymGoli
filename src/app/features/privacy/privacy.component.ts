import { Component } from '@angular/core';
import { Location } from '@angular/common';

@Component({
  selector: 'app-privacy',
  standalone: true,
  template: `
    <div class="page">

      <div class="page-header">
        <button class="back-btn" (click)="back()" aria-label="Tornar">
          <span class="material-symbols-outlined">arrow_back_ios</span>
        </button>
        <h1 class="page-title">Privacitat i Condicions</h1>
      </div>

      <div class="card">

        <div class="last-updated">Darrera actualització: abril 2025</div>

        <section class="section">
          <h2>1. Qui som</h2>
          <p>GymGoli és una aplicació personal de registre d'entrenaments. El responsable del tractament de les dades és el propietari del servei.</p>
        </section>

        <section class="section">
          <h2>2. Quines dades recollim</h2>
          <ul>
            <li><strong>Dades del compte:</strong> adreça de correu electrònic i contrasenya (xifrada), o informació bàsica de perfil si entres amb Google (nom i foto de perfil).</li>
            <li><strong>Dades d'entrenament:</strong> registres de sessions de gym i esport que tu introdueixes voluntàriament (exercicis, sèries, pesos, dates).</li>
            <li><strong>Configuració:</strong> preferències de l'app (objectius setmanals, consells activats).</li>
          </ul>
          <p>No recollim dades de localització, càmera, contactes ni cap altra informació del dispositiu.</p>
        </section>

        <section class="section">
          <h2>3. Per a qué usem les dades</h2>
          <ul>
            <li>Mostrar el teu historial d'entrenaments.</li>
            <li>Generar consells i estadístiques personalitzades (si ho tens activat).</li>
            <li>Mantenir la sessió iniciada i sincronitzar dades entre dispositius.</li>
          </ul>
          <p><strong>No venem ni compartim les teves dades amb tercers per a fins comercials.</strong></p>
        </section>

        <section class="section">
          <h2>4. Base legal</h2>
          <p>El tractament de les teves dades es basa en el consentiment que ens dones en crear el compte i en l'execució del servei (Article 6.1.a i 6.1.b del RGPD).</p>
        </section>

        <section class="section">
          <h2>5. Quant de temps conservem les dades</h2>
          <p>Les teves dades es conserven mentre tinguis el compte actiu. Si elimines el compte, les dades s'esborren de forma permanent i irreversible en un termini de 30 dies.</p>
        </section>

        <section class="section">
          <h2>6. Proveïdors tècnics</h2>
          <p>Usem <strong>Supabase</strong> (Supabase Inc.) com a plataforma d'autenticació i base de dades. Les dades s'emmagatzemen en servidors de la UE. Pots consultar la política de privacitat de Supabase a supabase.com/privacy.</p>
        </section>

        <section class="section">
          <h2>7. Els teus drets (RGPD)</h2>
          <p>Tens dret a:</p>
          <ul>
            <li><strong>Accés</strong> — sol·licitar una còpia de les teves dades.</li>
            <li><strong>Rectificació</strong> — corregir dades inexactes.</li>
            <li><strong>Supressió</strong> — eliminar el compte i totes les dades des de Configuració → Eliminar compte.</li>
            <li><strong>Portabilitat</strong> — exportar les teves dades en format llegible.</li>
            <li><strong>Oposició</strong> — desactivar els consells personalitzats des de Configuració.</li>
          </ul>
        </section>

        <section class="section">
          <h2>8. Cookies i emmagatzematge local</h2>
          <p>L'aplicació utilitza <code>localStorage</code> del navegador per guardar preferències de forma local al dispositiu. No usem cookies de seguiment ni de tercers.</p>
        </section>

        <section class="section">
          <h2>9. Contacte</h2>
          <p>Per a qualsevol consulta sobre privacitat o per exercir els teus drets, contacta'ns a través de la pàgina del projecte.</p>
        </section>

        <div class="divider"></div>

        <section class="section">
          <h2>Condicions d'ús</h2>
          <p>L'ús de GymGoli implica l'acceptació d'aquestes condicions:</p>
          <ul>
            <li>L'aplicació és per a ús personal. No pots usar-la per a fins comercials sense autorització.</li>
            <li>No introdueixis dades de tercers sense el seu consentiment.</li>
            <li>Ens reservem el dret a suspendre comptes que violin aquestes condicions.</li>
            <li>El servei es proporciona "tal com és", sense garanties d'disponibilitat continuada.</li>
          </ul>
        </section>

      </div>
    </div>
  `,
  styles: [`
    .page { padding: 0 16px 84px; max-width: 640px; margin: 0 auto; }

    /* ── Header ── */
    .page-header {
      display: flex; align-items: center; gap: 4px;
      padding: 12px 0 16px;
    }
    .back-btn {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: transparent; cursor: pointer; color: #555; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: rgba(0,0,0,0.06); }
    }
    .page-title {
      margin: 0; font-size: 20px; font-weight: 800; color: #1a1a1a; letter-spacing: -0.3px;
    }

    /* ── Content card ── */
    .card {
      background: white; border-radius: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.07);
      padding: 20px 20px 24px;
    }

    .last-updated {
      font-size: 11px; color: #999; margin-bottom: 20px;
      text-transform: uppercase; letter-spacing: 0.3px;
    }

    .section {
      margin-bottom: 20px;
      h2 {
        margin: 0 0 8px;
        font-size: 14px; font-weight: 700; color: #1a1a1a;
      }
      p, li {
        font-size: 13px; color: #444; line-height: 1.65; margin: 0 0 6px;
      }
      ul {
        margin: 6px 0 0 0; padding-left: 18px;
        li { margin-bottom: 4px; }
      }
      code {
        font-size: 12px; background: #f5f5f5; padding: 1px 5px; border-radius: 4px; color: #333;
      }
    }

    .divider {
      height: 1px; background: #f0f0f0; margin: 8px 0 20px;
    }
  `],
})
export class PrivacyComponent {
  constructor(private location: Location) {}
  back(): void { this.location.back(); }
}
