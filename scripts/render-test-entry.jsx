import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import ProductsSection from '../src/components/ProductsSection'
import OrdersSection from '../src/components/OrdersSection'
// The supabase module is replaced by a stub plugin during the test build —
// __seed lets each scenario set the rows the stub returns.
export { __seed } from '../src/lib/supabase'

export { createRoot, createElement, ProductsSection, OrdersSection }
