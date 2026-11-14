import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'sidebar' | 'compact';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {variant === 'sidebar' ? (
        <button
          type="button"
          onClick={handleClick}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-3 py-2.5 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
        >
          <Download className="w-4 h-4 text-orange-400 shrink-0" />
          <span>{isInstallable ? 'Install Aplikasi' : 'Panduan Install HP'}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          title={isInstallable ? 'Install aplikasi ke perangkat' : 'Cara install di HP'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer"
        >
          <Smartphone className="w-4 h-4 text-orange-500 shrink-0" />
          <span className="hidden sm:inline">{isInstallable ? 'Install App' : 'Install HP'}</span>
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Install SENTRA ANGLER di {isIOS ? 'iPhone / iPad' : 'Perangkat Anda'}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Akses buku kas langsung dari layar utama seperti aplikasi native.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Tutup panduan"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-3 text-sm text-slate-700">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>
                    Pastikan Anda membuka halaman ini melalui browser <strong>Safari</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span className="flex items-center gap-1.5 flex-wrap">
                    Ketuk ikon <strong>Share</strong> <Share className="w-4 h-4 text-orange-500 inline" /> di bilah bawah Safari.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                    3
                  </span>
                  <span>
                    Gulir ke bawah dan pilih <strong>Add to Home Screen</strong> lalu ketuk <strong>Add</strong>.
                  </span>
                </li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-3 text-sm text-slate-700">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>
                    Buka menu browser (ikon <strong>⋮</strong> di Chrome Android atau ikon install di address bar desktop).
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span>
                    Pilih <strong>Install app</strong> atau <strong>Tambahkan ke Layar Utama</strong>.
                  </span>
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-6 w-full h-11 rounded-xl bg-[#0B192C] text-white text-sm font-semibold hover:bg-[#132947] transition-colors cursor-pointer"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
};
