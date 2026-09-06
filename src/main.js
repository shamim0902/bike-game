import { createApp } from 'vue'
import App from './App.vue'
import './styles/base.scss'
import { registerGsap } from './composables/useGsap'

registerGsap()
createApp(App).mount('#app')
