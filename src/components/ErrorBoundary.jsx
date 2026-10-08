import { Component } from 'react'

// Catches render/lifecycle/effect errors so a crash shows a retry screen
// instead of the blank white page React produces when nothing handles it.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" className="app-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="bg-white border border-border rounded-2xl p-5 max-w-[380px] w-full text-center shadow-sm">
            <div className="text-3xl mb-2">⚠️</div>
            <h2 className="text-base font-bold text-ink m-0 mb-2">حدث خطأ غير متوقع</h2>
            <p className="text-sm text-subtle m-0 mb-3 leading-relaxed">
              تعذّر عرض الصفحة. بياناتك محفوظة في قاعدة البيانات — أعد المحاولة أو حدّث الصفحة.
            </p>
            <pre
              className="text-[10px] text-danger bg-red-50 rounded-lg p-2 mb-4 overflow-x-auto text-left m-0"
              dir="ltr"
            >
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="w-full h-11 rounded-xl bg-purple text-white font-bold text-sm mb-2 hover:bg-purple-2 transition-colors"
            >
              إعادة المحاولة
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full h-11 rounded-xl bg-gray-100 text-ink font-bold text-sm hover:bg-gray-200 transition-colors"
            >
              تحديث الصفحة
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
