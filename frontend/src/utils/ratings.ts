import { n } from './formatters';
import type { RatingRule, RatingResult } from '../types';

export const rate = (val: unknown, rules: ReadonlyArray<RatingRule>): RatingResult => {
  if (n(val) == null) return { lbl: '—', c: 'var(--text-tertiary)', bg: '#1a202c', score: 0 };
  const num = val as number;
  for (const r of rules) if (r.test(num)) return r;
  return { lbl: '—', c: 'var(--text-tertiary)', bg: '#1a202c', score: 0 };
};

export const R: Record<string, RatingRule[]> = {
  gm: [
    {test:v=>v>.40, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Ventaja competitiva fuerte (moat). Poder de fijación de precios."},
    {test:v=>v>.25, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Márgenes saludables, empresa competitiva."},
    {test:v=>v>.15, lbl:"Aceptable",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Márgenes ajustados. Sector competitivo o commoditizado."},
    {test:v=>v<=.15, lbl:"Débil",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"Poco poder de precios. Riesgo en recesiones."},
  ],
  om: [
    {test:v=>v>.20, lbl:"Fuerte",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Negocio muy eficiente, costes bien controlados."},
    {test:v=>v>.10, lbl:"Aceptable",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Rentabilidad operativa decente."},
    {test:v=>v>.05, lbl:"Débil",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Márgenes bajos, vulnerables a subidas de costes."},
    {test:v=>v<=.05, lbl:"Muy débil",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"La empresa apenas genera beneficio operativo."},
  ],
  nm: [
    {test:v=>v>.15, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3},
    {test:v=>v>.08, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2},
    {test:v=>v>.03, lbl:"Aceptable",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1},
    {test:v=>v<=.03, lbl:"Débil",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0},
  ],
  roe: [
    {test:v=>v>.15, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Genera gran retorno para los accionistas."},
    {test:v=>v>.10, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Retorno aceptable."},
    {test:v=>v>.05, lbl:"Modesto",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Retorno bajo, capital infrautilizado."},
    {test:v=>v<=.05, lbl:"Débil",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"Destruye valor para accionistas."},
  ],
  roic: [
    {test:v=>v>.15, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3},
    {test:v=>v>.10, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2},
    {test:v=>v>.06, lbl:"Aceptable",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1},
    {test:v=>v<=.06, lbl:"Débil",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0},
  ],
  fcfm: [
    {test:v=>v>.20, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3},
    {test:v=>v>.10, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2},
    {test:v=>v>.05, lbl:"Aceptable",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1},
    {test:v=>v<=.05, lbl:"Débil",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0},
  ],
  d2fcf: [
    {test:v=>v<2, lbl:"Saludable",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Deuda fácilmente pagable con el flujo de caja."},
    {test:v=>v<4, lbl:"Aceptable",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Deuda manejable pero vigilar."},
    {test:v=>v<6, lbl:"Elevada",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Apalancamiento alto, riesgo en recesión."},
    {test:v=>v>=6, lbl:"Peligrosa",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"Riesgo financiero grave. Posible restructuración."},
  ],
  ic: [
    {test:v=>v>10, lbl:"Muy sólido",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Deuda muy bien cubierta por beneficio operativo."},
    {test:v=>v>5, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Sin riesgo relevante de impago de intereses."},
    {test:v=>v>2, lbl:"Aceptable",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Controlado pero vigilable."},
    {test:v=>v<=2, lbl:"Riesgo",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"Puede no generar suficiente para cubrir intereses."},
  ],
  eve: [
    {test:v=>v<8, lbl:"Barata",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Cotiza por debajo de su valor operativo."},
    {test:v=>v<12, lbl:"Razonable",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Precio justo para el beneficio que genera."},
    {test:v=>v<18, lbl:"Cara",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"El mercado descuenta mucho crecimiento futuro."},
    {test:v=>v>=18, lbl:"Muy cara",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"Múltiplo muy elevado. Peligro si decepciona."},
  ],
  pio: [
    {test:v=>v>=8, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Empresa financieramente muy sólida."},
    {test:v=>v>=6, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Buena solidez financiera general."},
    {test:v=>v>=4, lbl:"Neutral",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Sin señales claras. Investigar más."},
    {test:v=>v<4, lbl:"Débil",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"Señales de debilidad financiera."},
  ],
  mos: [
    {test:v=>v>.30, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3},
    {test:v=>v>.15, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2},
    {test:v=>v>0, lbl:"Ajustado",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1},
    {test:v=>v<=0, lbl:"Sin margen",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0},
  ],
  growth: [
    {test:v=>v>.10, lbl:"Fuerte",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3},
    {test:v=>v>.05, lbl:"Moderado",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2},
    {test:v=>v>.0, lbl:"Lento",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1},
    {test:v=>v<=0, lbl:"Declive",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0},
  ],
  big5: [
    {test:v=>v>=.10, lbl:"≥10% ✓",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Phil Town: ≥10% es la regla. La empresa reinvierte capital eficientemente."},
    {test:v=>v>=.05, lbl:"5-10%",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Por debajo del umbral Rule #1. Investigar por qué."},
    {test:v=>v>=0, lbl:"<5%",c:"#ff9f0a",bg:"rgba(255,159,10,.10)",score:0,tip:"Crecimiento muy bajo. ¿Hay moat?"},
    {test:v=>v<0, lbl:"Negativo ✗",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"La métrica está en declive. Señal de alerta."},
  ],
  payback: [
    {test:v=>v<=8, lbl:"Excelente",c:"#30d158",bg:"rgba(48,209,88,.12)",score:3,tip:"Phil Town: ≤8 años es el objetivo. Recuperas tu inversión rápido."},
    {test:v=>v<=10, lbl:"Bueno",c:"#64d2ff",bg:"rgba(100,210,255,.10)",score:2,tip:"Aceptable pero por encima del ideal de Phil Town."},
    {test:v=>v<=15, lbl:"Lento",c:"#ffd60a",bg:"rgba(255,214,10,.10)",score:1,tip:"Payback lento. ¿Merece la pena esperar tanto?"},
    {test:v=>v>15, lbl:"Muy lento",c:"#ff453a",bg:"rgba(255,69,58,.10)",score:0,tip:"Demasiado tiempo para recuperar la inversión."},
  ],
};
