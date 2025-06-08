import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const ThreeViewer = () => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x87ceeb)

    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    )
    camera.position.set(0, 50, 100)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const ambient = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambient)

    const dir = new THREE.DirectionalLight(0xffffff, 1)
    dir.position.set(50, 50, 50)
    scene.add(dir)

    const planeGeom = new THREE.PlaneGeometry(500, 500)
    const planeMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
    const plane = new THREE.Mesh(planeGeom, planeMat)
    plane.rotation.x = -Math.PI / 2
    scene.add(plane)

    const onResize = () => {
      if (!container) return
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    }
    window.addEventListener('resize', onResize)

    const animate = () => {
      renderer.render(scene, camera)
      requestAnimationFrame(animate)
    }
    animate()

    return () => {
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
    }
  }, [])

  return <div ref={containerRef} style={{ height: '100vh', width: '100%' }} />
}

export default ThreeViewer
