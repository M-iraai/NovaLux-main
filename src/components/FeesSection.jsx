import { useState, useEffect, useMemo } from 'react'
import { Search, Copy, Check, X, Home, Building2, Truck, MapPin, Phone, ChevronRight, Wrench, Ruler } from 'lucide-react'

const WILAYA_EN = {
  'أدرار': 'Adrar', 'الشلف': 'Chlef', 'الأغواط': 'Laghouat', 'أم البواقي': 'Oum El Bouaghi',
  'باتنة': 'Batna', 'بجاية': 'Béjaïa', 'بسكرة': 'Biskra', 'بشار': 'Béchar',
  'البلدة': 'Blida', 'البويرة': 'Bouira', 'تمنراست': 'Tamanrasset', 'تبسة': 'Tébessa',
  'تلمسان': 'Tlemcen', 'تيارت': 'Tiaret', 'تيزي وزو': 'Tizi Ouzou', 'الجزائر': 'Algiers',
  'الجلفة': 'Djelfa', 'جيجل': 'Jijel', 'سطيف': 'Sétif', 'سعيدة': 'Saïda',
  'سكيكدة': 'Skikda', 'سيدي بلعباس': 'Sidi Bel Abbès', 'عنابة': 'Annaba',
  'قالمة': 'Guelma', 'قسنطينة': 'Constantine', 'المدية': 'Médéa', 'مستغانم': 'Mostaganem',
  'المسيلة': 'Msila', 'معسكر': 'Mascara', 'ورقلة': 'Ouargla', 'وهران': 'Oran',
  'البيض': 'El Bayadh', 'إليزي': 'Illizi', 'برج بوعريريج': 'Bordj Bou Arréridj',
  'بومرداس': 'Boumerdès', 'الطارف': 'El Tarf', 'تندوف': 'Tindouf', 'تيسمسيلت': 'Tissemsilt',
  'الوادي': 'El Oued', 'خنشلة': 'Khenchela', 'سوق أهراس': 'Souk Ahras',
  'تيبازة': 'Tipaza', 'ميلة': 'Mila', 'عين الدفلى': 'Aïn Defla',
  'النعامة': 'Naâma', 'عين تموشنت': 'Aïn Témouchent', 'غرداية': 'Ghardaïa',
  'غليزان': 'Relizane', 'تيميمون': 'Timimoun', 'برج باجي مختار': 'Bordj Badji Mokhtar',
  'أولاد جلال': 'Ouled Djellal', 'بني عباس': 'Béni Abbès', 'عين صالح': 'In Salah',
  'عين قزام': 'In Guezzam', 'توقرت': 'Touggourt', 'جانت': 'Djanet',
  'المغير': 'El MGhair', 'المنيعة': 'El Meniaa',
}

const wilayaNameEn = (name) => WILAYA_EN[name] || ''

export default function FeesSection() {
  const [feesData, setFeesData] = useState(null)
  const [wilayas, setWilayas] = useState([])
  const [desks, setDesks] = useState([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/fees').then(r => r.json()),
      fetch('/api/wilayas').then(r => r.json()),
      fetch('/api/desks').then(r => r.json()),
    ]).then(([fees, wils, desksData]) => {
      setFeesData(fees)
      setWilayas(wils)
      setDesks(Array.isArray(desksData) ? desksData : (desksData?.desks || []))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const sortedWilayas = useMemo(() => {
    return [...wilayas].sort((a, b) => {
      const enA = wilayaNameEn(a.wilaya_name)
      const enB = wilayaNameEn(b.wilaya_name)
      return enA.localeCompare(enB)
    })
  }, [wilayas])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sortedWilayas
    return sortedWilayas.filter(w => {
      const en = wilayaNameEn(w.wilaya_name).toLowerCase()
      const ar = w.wilaya_name.toLowerCase()
      const id = String(w.wilaya_id)
      return en.startsWith(q) || ar.startsWith(q) || id.startsWith(q)
    })
  }, [sortedWilayas, search])

  const selectedFee = useMemo(() => {
    if (!feesData || !selectedId) return null
    const arr = feesData.livraison || []
    return arr.find(f => f.wilaya_id === selectedId) || null
  }, [feesData, selectedId])

  const selectedWilayaDesks = useMemo(() => {
    if (!selectedId) return []
    return desks.filter(d => String(d.wilayaId) === String(selectedId))
  }, [desks, selectedId])

  const handleCopy = () => {
    if (!selectedFee) return
    const text = `التوصيل للمنزل: ${selectedFee.tarif} دج\nالتوصيل للبيرو: ${selectedFee.tarif_stopdesk} دج`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-8 h-8 border-3 border-purple/20 border-t-purple rounded-full animate-spin" />
        <span className="text-subtle2 text-sm">جاري تحميل الأسعار...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-purple-500 via-purple-600 to-indigo-600 rounded-2xl p-4 shadow-lg shadow-purple/10">
        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <Truck size={18} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-white">أسعار التوصيل</h2>
          <p className="text-xs text-white/70">اختر ولاية لمعرفة التكلفة</p>
        </div>
        <span className="bg-white/15 text-white text-xs font-semibold rounded-full px-3 py-1.5 shrink-0">
          {feesData?.livraison?.length || 0} ولاية
        </span>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-subtle2 pointer-events-none" />
        <input
          type="search"
          placeholder="ابحث: الجزائر، Oran، 16..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-12 pl-12 pr-10 rounded-2xl border border-border bg-white text-sm text-ink placeholder:text-subtle2/60 focus:outline-none focus:border-purple focus:ring-2 focus:ring-purple/10 transition-all shadow-product"
        />
        {search && (
          <button
            onClick={() => { setSearch(''); setSelectedId(null) }}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            aria-label="مسح البحث"
          >
            <X size={14} className="text-subtle2" />
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-xs text-subtle2 px-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple/50" />
          {filtered.length} ولاية
        </span>
        {selectedId && (
          <span className="flex items-center gap-1.5 text-purple font-medium">
            <span className="w-2 h-2 rounded-full bg-purple" />
            تفاصيل مُختارة
          </span>
        )}
      </div>

      {/* Wilayas List — redesigned as clean list items */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-subtle2">
            <Search size={32} className="opacity-30" />
            <span className="text-sm font-medium">لا توجد نتائج</span>
            <span className="text-xs">جرّب كلمة بحث مختلفة</span>
          </div>
        )}

        {filtered.map(w => {
          const fee = (feesData?.livraison || []).find(f => f.wilaya_id === w.wilaya_id)
          const isSelected = selectedId === w.wilaya_id

          return (
            <div key={w.wilaya_id} className={`rounded-2xl border transition-all ${isSelected 
              ? 'bg-lav border-purple/40 shadow-stat ring-1 ring-purple/20' 
              : 'bg-white border-border hover:border-purple/20 hover:shadow-sm'}`}>
              
              {/* Main row — wilaya name + price */}
              <button
                onClick={() => setSelectedId(isSelected ? null : w.wilaya_id)}
                className={`w-full flex items-center gap-3 p-4 text-right transition-all ${isSelected ? 'bg-lav/40' : ''}`}
              >
                {/* ID badge */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold transition-colors ${isSelected 
                  ? 'bg-purple text-white' 
                  : 'bg-gray-100 text-subtle2'}`}>
                  {String(w.wilaya_id).padStart(2, '0')}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-bold truncate ${isSelected ? 'text-purple' : 'text-ink'}`}>
                    {wilayaNameEn(w.wilaya_name)}
                  </div>
                  <div className="text-xs text-subtle2 truncate">{w.wilaya_name}</div>
                </div>

                {/* Price — prominent when available */}
                {fee && (
                  <div className={`flex-shrink-0 text-left px-3 py-1.5 rounded-xl ${isSelected 
                    ? 'bg-white/20' 
                    : 'bg-gray-50'}`}>
                    <div className="text-lg font-extrabold text-ink">{fee.tarif}</div>
                    <div className="text-[10px] text-subtle2">دج للمنزل</div>
                  </div>
                )}

                {/* Expand indicator */}
                <div className={`flex-shrink-0 transition-transform duration-200 ${isSelected ? 'rotate-180' : ''}`}>
                  <ChevronRight size={18} className={isSelected ? 'text-purple' : 'text-border7'} />
                </div>
              </button>

              {/* Expanded detail panel */}
              {isSelected && selectedFee && (
                <div className="mx-4 mb-4 pt-4 border-t border-purple/10 space-y-3">
                  {/* Two price cards side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl p-3.5 shadow-sm border border-border">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Home size={12} className="text-purple" />
                        <span className="text-[10px] font-semibold text-subtle2 uppercase tracking-wide">للمنزل</span>
                      </div>
                      <div className="text-2xl font-extrabold text-ink">{selectedFee.tarif} <span className="text-sm font-medium text-subtle2">دج</span></div>
                    </div>
                    <div className="bg-white rounded-xl p-3.5 shadow-sm border border-border">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Building2 size={12} className="text-purple" />
                        <span className="text-[10px] font-semibold text-subtle2 uppercase tracking-wide">للبيرو</span>
                      </div>
                      <div className="text-2xl font-extrabold text-ink">{selectedFee.tarif_stopdesk} <span className="text-sm font-medium text-subtle2">دج</span></div>
                    </div>
                  </div>

                  {/* Copy button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCopy() }}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${copied 
                      ? 'bg-emerald-500 text-white' 
                      : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}
                  >
                    {copied ? (
                      <>
                        <Check size={16} className="animate-[popIn_0.2s_ease]" />
                        تم النسخ!
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        نسخ الأسعار
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Nearby desks section */}
              {isSelected && selectedWilayaDesks.length > 0 && (
                <div className="mx-4 mb-4 pt-3 border-t border-border space-y-2">
                  <div className="flex items-center gap-1.5 text-purple text-xs font-semibold">
                    <MapPin size={12} />
                    <span>المراكز القريبة ({selectedWilayaDesks.length})</span>
                  </div>
                  <div className="space-y-1 max-h-[160px] overflow-y-auto hide-scrollbar">
                    {selectedWilayaDesks.map(d => (
                      <div
                        key={d.id}
                        className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white border border-border hover:border-purple/30 transition-colors"
                      >
                        <div className="w-7 h-7 rounded-lg bg-purple/10 flex items-center justify-center shrink-0">
                          <Building2 size={12} className="text-purple" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-ink truncate">{d.name || d.commune || 'مركز غير معرف'}</div>
                          {d.commune && <div className="text-[10px] text-subtle2 truncate">{d.commune}</div>}
                          {d.address && <div className="text-[10px] text-subtle2 truncate">{d.address}</div>}
                          {d.phone && (
                            <div className="text-[10px] text-subtle2 truncate flex items-center gap-1 mt-0.5">
                              <Phone size={9} />
                              {d.phone}
                            </div>
                          )}
                        </div>
                        <ChevronRight size={14} className="text-purple/40 shrink-0 mt-1" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
