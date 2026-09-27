import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

// 13-build-plan.md §Architecture: the only `registerPlugin` call in the app.
// Every component imports gsap/ScrollTrigger/useGSAP from this module,
// never straight from the packages, so registration always runs first.
gsap.registerPlugin(useGSAP, ScrollTrigger)

export { gsap, ScrollTrigger, useGSAP }
