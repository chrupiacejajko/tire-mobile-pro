'use client';

interface TaskService {
  name?: string;
  service_id?: string;
  price?: number;
  quantity?: number;
}

function priceFmt(price: number): string {
  return price.toFixed(2).replace('.', ',') + ' zl';
}

export default function ServiceList({
  services,
}: {
  services: Array<TaskService | string>;
}) {
  if (services.length === 0) return null;

  return (
    <div className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-5">
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
        Uslugi
      </h2>
      <div className="space-y-3">
        {services.map((s, i) => {
          const name = typeof s === 'string' ? s : (s as TaskService).name ?? '';
          const price = typeof s !== 'string' ? (s as TaskService).price : undefined;
          const qty = typeof s !== 'string' ? (s as TaskService).quantity : undefined;
          return (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
                <span className="text-sm text-gray-800">
                  {name}
                  {qty && qty > 1 && (
                    <span className="text-gray-400 ml-1.5">x{qty}</span>
                  )}
                </span>
              </div>
              {price !== undefined && price > 0 && (
                <span className="text-sm text-gray-600 font-semibold tabular-nums">
                  {priceFmt(price)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
