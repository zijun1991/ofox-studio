import '@renderer/assets/styles/index.css'
import '@renderer/assets/styles/tailwind.css'
import '@ant-design/v5-patch-for-react-19'

import { loggerService } from '@logger'
import AntdProvider from '@renderer/context/AntdProvider'
import { CodeStyleProvider } from '@renderer/context/CodeStyleProvider'
import { ThemeProvider } from '@renderer/context/ThemeProvider'
import storeSyncService from '@renderer/services/StoreSyncService'
import store, { persistor } from '@renderer/store'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'

import WebviewManagerApp from './WebviewManagerApp'

loggerService.initWindowSource('WebviewManager')

storeSyncService.subscribe()

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(
  <Provider store={store}>
    <ThemeProvider>
      <AntdProvider>
        <CodeStyleProvider>
          <PersistGate loading={null} persistor={persistor}>
            <WebviewManagerApp />
          </PersistGate>
        </CodeStyleProvider>
      </AntdProvider>
    </ThemeProvider>
  </Provider>
)
