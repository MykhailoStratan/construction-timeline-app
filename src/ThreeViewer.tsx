import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const ThreeViewer = () => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('skyblue')

    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000,
    )
    camera.position.set(0, 5, 10)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight,
    )
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)

    const ambient = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambient)

    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.position.set(5, 10, 7.5)
    scene.add(light)

    const planeGeometry = new THREE.PlaneGeometry(100, 100)
    const planeMaterial = new THREE.MeshPhongMaterial({ color: 0x808080 })
    const plane = new THREE.Mesh(planeGeometry, planeMaterial)
    plane.rotation.x = -Math.PI / 2
    scene.add(plane)

    const onResize = () => {
      if (!containerRef.current) return
      camera.aspect =
        containerRef.current.clientWidth / containerRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(
        containerRef.current.clientWidth,
        containerRef.current.clientHeight,
      )
    }

    window.addEventListener('resize', onResize)

    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      frameRef.current = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      containerRef.current?.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />
}

export default ThreeViewer
