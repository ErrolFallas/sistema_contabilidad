export default function Placeholder({ title, description }) {
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-semibold text-slate-800 mb-2">{title}</h1>
      <p className="text-sm text-slate-500">{description}</p>
      <div className="mt-6 bg-amber-50 border border-amber-200 text-amber-800 rounded p-3 text-sm">
        Modulo pendiente de Fase 2. Esqueleto creado en Fase 1.
      </div>
    </div>
  );
}
