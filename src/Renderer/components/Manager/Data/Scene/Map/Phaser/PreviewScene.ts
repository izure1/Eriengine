import path from 'path'
import Phaser from 'phaser'
import { ipcRenderer } from 'electron'
import { Plugin as ActorPlugin, Actor } from '@eriengine/plugin-actor'
import { Plugin as DialoguePlugin } from '@eriengine/plugin-dialogue'
import { Plugin as FogOfWarPlugin } from '@eriengine/plugin-fog-of-war'
import { Plugin as IsometricScenePlugin } from '@eriengine/plugin-isometric-scene'
import { PointerPlugin as IsometricCursorPlugin, SelectPlugin as IsometricSelectPlugin } from '@eriengine/plugin-isometric-cursor'
import { FileWatcher } from '@/Utils/FileWatcher'

import * as Types from './Vars/Types'
import { SceneDataTransfer } from './SceneDataTransfer'
import { SceneMapManager } from './SceneMapManager'

import {
    PROJECT_SRC_DIRECTORY_NAME,
    PROJECT_SRC_ASSET_DIRECTORY_NAME
} from '@/Const'

export default class PreviewScene extends Phaser.Scene {
    private isometric!: IsometricScenePlugin
    private cursor!: IsometricCursorPlugin
    private select!: IsometricSelectPlugin
    private actor!: ActorPlugin
    private fow!: FogOfWarPlugin
    private dialogue!: DialoguePlugin

    readonly transfer: SceneDataTransfer = new SceneDataTransfer
    readonly mapData: SceneMapManager = new SceneMapManager({ side: 2000, walls: [], floors: [] })

    private watcher: FileWatcher|null = null
    private projectDirectory: string = ''
    private storageKey: string = ''
    private mapFilePath: string = ''
    private cameraControl: Phaser.Cameras.Controls.SmoothedKeyControl|null = null

    private requireImages:  Types.PaletteImage[] = []
    private requireSprites: Types.PaletteSprite[] = []

    private shiftKey: Phaser.Input.Keyboard.Key|null = null

    private dragStartOffset: Types.Point2 = { x: 0, y: 0 }
    private selectionType: number = 0
    readonly selectionWalls: Set<Phaser.Physics.Matter.Sprite> = new Set
    readonly selectionTiles: Set<Phaser.GameObjects.Sprite> = new Set

    private disposeBrush: Types.PaletteImage|Types.PaletteSprite|null = null

    constructor(projectDirectory: string, storageKey: string, filePath: string) {
        super({ key: '__preview-scene__', active: false })

        this.projectDirectory = projectDirectory
        this.storageKey = storageKey
        this.mapFilePath = filePath

        this.transfer
        .on('receive-image-list', (list): void => {
            this.requireImages = list
        })
        .on('receive-sprite-list', (list): void => {
            this.requireSprites = list
        })
    }

    private get assetDirectory(): string {
        return path.resolve(this.projectDirectory, PROJECT_SRC_DIRECTORY_NAME, PROJECT_SRC_ASSET_DIRECTORY_NAME)
    }

    private get isDisposeEnable(): boolean {
        if (!this.selectionType) {
            return false
        }
        if (!this.disposeBrush) {
            return false
        }
        if (!this.textures.exists(this.disposeBrush.key)) {
            return false
        }
        return true
    }

    private get isAnimationPalette(): boolean {
        if (!this.isDisposeEnable) {
            return false
        }
        return Object.prototype.hasOwnProperty.call(this.disposeBrush, 'frameWidth')
    }

    private get cursorSide(): number {
        if (!this.isDisposeEnable) {
            return 0
        }

        let width: number
        let height: number

        if (this.isAnimationPalette) {
            const brush: Types.PaletteSprite = this.disposeBrush as Types.PaletteSprite
            width   = brush.frameWidth
            height  = brush.frameHeight
        }
        else {
            const texture = this.textures.get(this.disposeBrush!.key)
            if (!texture) {
                return 0
            }
            width = texture.source[0].width
            height = texture.source[0].height

            if (!width || !height) {
                return 0
            }
        }

        return this.getIsometricSideFromWidth(width / 2)
    }

    private setCameraMoving(): void {
        const camera                = this.cameras.main
        const acceleration: number  = 0.05
        const drag: number          = 0.0005
        const maxSpeed: number      = 1

        this.cameraControl = new Phaser.Cameras.Controls.SmoothedKeyControl({
            camera,
            left:       this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A, false),
            right:      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D, false),
            up:         this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W, false),
            down:       this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S, false),
            zoomIn:     this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q, false),
            zoomOut:    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E, false),
            acceleration,
            drag,
            maxSpeed
        })

        camera.pan(0, 0, 0)
    }

    private setSelectionType(type: number): void {
        this.selectionType = type
        this.unselectObjects()
    }

    private setDisposeBrush(brush: Types.PaletteImage|Types.PaletteSprite|null): void {
        this.disposeBrush = brush

        if (!this.selectionType) {
            this.select.enable(false)
        }
        else {
            this.select.enable(!brush)
        }
    }

    private updateDisposeCursor(): void {
        this.cursor.enable(false)
        if (!this.isDisposeEnable) {
            return
        }
        this.cursor.enable(true)
        this.cursor.setGridSide(this.cursorSide)
    }

    private getDiagonal(width: number, height: number): number {
        return Math.sqrt(Math.pow(width, 2) + Math.pow(height, 2))
    }

    private getIsometricSideFromWidth(width: number): number {
        const rad: number = Phaser.Math.DegToRad(26.57)
        return width / Math.cos(rad)
    }

    private unselectObjects(): void {
        this.select.unselect()

        for (const wall of this.selectionWalls) {
            wall.clearTint()
        }
        for (const tile of this.selectionTiles) {
            tile.clearTint()
        }

        this.selectionWalls.clear()
        this.selectionTiles.clear()
    }

    private selectObjects(e: Phaser.Input.Pointer, selection: Types.Rect): void {
        if (!this.selectionType) {
            return
        }
        if (this.disposeBrush) {
            return
        }

        const fillColor: number = Phaser.Display.Color.GetColor(255, 0, 0)

        switch (this.selectionType) {
            case 1:
                break
            case 2: {
                const walls: Phaser.Physics.Matter.Sprite[] = this.select.select(selection, this.isometric.walls) as Phaser.Physics.Matter.Sprite[]
                for (const wall of walls) {
                    wall.setTint(fillColor)
                    this.selectionWalls.add(wall)
                }
                break
            }
            case 3: {
                const tiles: Phaser.GameObjects.Sprite[] = this.select.select(selection, this.isometric.tiles) as Phaser.GameObjects.Sprite[]
                for (const tile of tiles) {
                    tile.setTint(fillColor)
                    this.selectionTiles.add(tile)
                }
                break
            }
        }
    }

    private deleteSelectionObjects(): void {
        this.selectionWalls.forEach((wall): void => {
            this.mapData.dropWallData(wall)
            wall.destroy()
        })

        this.selectionTiles.forEach((tile): void => {
            this.mapData.dropFloorData(tile)
            tile.destroy()
        })

        this.selectionWalls.clear()
        this.selectionTiles.clear()
    }

    private setItemProperties({ alias, scale, isSensor }: Types.PaletteProperties): void {
        for (const wall of this.selectionWalls) {
            scale = Number(scale)
            isSensor = Boolean(isSensor)

            // 올바르지 않은 값이 넘어왔을 경우 객체를 삭제하고 데이터에서도 제거함
            if (isNaN(scale) || typeof scale !== 'number') {
                wall.destroy()
                this.selectionWalls.delete(wall)
                continue
            }

            wall.setScale(scale)
            wall.setSensor(isSensor)
            wall.data.set('alias', alias)

            this.mapData.modifyWallData(wall)
        }
    }

    private getCoordKey(x: number, y: number): string {
        return `${x},${y}`
    }

    private dispose(e: Phaser.Input.Pointer): void {
        if (!this.isDisposeEnable) {
            return
        }

        // shift키를 누른 상태로 작업했을 시, 직선으로 계산함
        let x: number
        let y: number
        if (e.event.shiftKey) {
            const startOffset: Point2 = this.cursor.calcCursorOffset(this.dragStartOffset)
            const distanceX: number = e.worldX - startOffset.x
            const distanceY: number = e.worldY - startOffset.y
            
            // 정확히 상하/좌우로 이동하거나, 이동하지 않았을 경우
            if (distanceX === 0 || distanceY === 0) {
                x = this.cursor.pointerX
                y = this.cursor.pointerY
            }
            else {
                let deg: number
                const distance: number  = this.getDiagonal(distanceX, distanceY)

                // ↗
                if (distanceX > 0 && distanceY < 0) {
                    deg = -26.57
                }
                // ↘
                else if (distanceX > 0 && distanceY > 0) {
                    deg = 26.57
                }
                // ↙
                else if (distanceX < 0 && distanceY > 0) {
                    deg = 180 - 26.57
                }
                // ↖
                else {
                    deg = 180 + 26.57
                }

                const rad: number = Phaser.Math.DegToRad(deg)
                const offset: Point2 = this.cursor.calcCursorOffset({
                    x: Math.cos(rad) * distance,
                    y: Math.sin(rad) * distance
                })

                x = startOffset.x + offset.x
                y = startOffset.y + offset.y
            }
        }
        else {
            x = this.cursor.pointerX
            y = this.cursor.pointerY
        }

        let animsKey: string|undefined = undefined

        if (this.isAnimationPalette) {
            const brush: Types.PaletteSprite = this.disposeBrush as Types.PaletteSprite
            animsKey = brush.key
        }

        switch (this.selectionType) {
            case 1:
                break
            
            case 2: {
                const wall = this.isometric.setWalltile(x, y, this.disposeBrush!.key, undefined, animsKey)
                wall.setDataEnabled()
                this.mapData.insertWallData(wall)
                break
            }

            case 3: {
                const floor = this.isometric.setFloortile(x, y, this.disposeBrush!.key, undefined, animsKey)
                this.mapData.insertFloorData(floor)
                break
            }
        }
    }

    private updateCamera(delta: number): void {
        this.cameraControl?.update(delta)
        
        // 카메라 축소/확대 최대치 설정
        if (this.cameras.main.zoom < 0.25)  this.cameras.main.zoom = 0.25
        if (this.cameras.main.zoom > 1)     this.cameras.main.zoom = 1
    }

    private destroyCamera(): void {
        this.cameraControl?.destroy()
    }

    private generateWatcher(): void {
        this.destroyWatcher()
        this.watcher = new FileWatcher(this.mapFilePath, false).update(this.onMapDataChange.bind(this)).start().emit()
    }

    private generateAnimation(): void {
        for (const anims of this.requireSprites) {
            const { key, frameRate, start, end } = anims
            if (this.anims.exists(key)) {
                continue
            }
            this.anims.create({
                key,
                frameRate,
                frames: this.anims.generateFrameNumbers(key, { start, end }),
                repeat: -1
            })
        }
    }

    private async onMapDataChange(): Promise<void> {
        await this.generateMapData()
    }

    private destroyWatcher(): void {
        this.watcher?.destroy()
        this.watcher = null
    }

    private updateDragStartOffset({ worldX, worldY }: Phaser.Input.Pointer): void {
        this.dragStartOffset = { x: worldX, y: worldY }
    }

    private onMouseLeftDown(e: Phaser.Input.Pointer): void {
        this.updateDragStartOffset(e)
        this.dispose(e)

        if (!e.event.shiftKey) {
            this.unselectObjects()
        }
    }

    private onMouseLeftDrag(e: Phaser.Input.Pointer): void {
        this.dispose(e)
    }

    private onMouseLeftUp(e: Phaser.Input.Pointer): void {
    }
    
    private onMouseRightDown(e: Phaser.Input.Pointer): void {
    }

    private onMouseRightUp(e: Phaser.Input.Pointer): void {
    }

    private async generateMapData(): Promise<boolean> {
        const sceneMapRead: Engine.GameProject.ReadSceneMapSuccess|Engine.GameProject.ReadSceneMapFail = await ipcRenderer.invoke('read-scene-map', this.projectDirectory, this.storageKey)
        if (!sceneMapRead.success) {
            this.transfer.emit('load-map-fail', sceneMapRead.message)
            return false
        }
        this.mapData.setData(sceneMapRead.content)
        this.transfer.emit('load-map-success', this.mapData)
        return true
    }

    private attachMouseEvent(): void {
        this.input.on(Phaser.Input.Events.POINTER_DOWN, (e: Phaser.Input.Pointer): void => {
            switch (e.button) {
                case 0:
                    this.onMouseLeftDown(e)
                    break
                case 2:
                    this.onMouseRightDown(e)
                    break
            }
        })

        this.input.on(Phaser.Input.Events.POINTER_UP, (e: Phaser.Input.Pointer): void => {
            switch (e.button) {
                case 0:
                    this.onMouseLeftUp(e)
                    break
                case 2:
                    this.onMouseRightUp(e)
                    break
            }
        })

        this.input.on(Phaser.Input.Events.POINTER_MOVE, (e: Phaser.Input.Pointer): void => {
            switch (e.buttons) {
                case 1:
                    this.onMouseLeftDrag(e)
                    break
            }
        })
    }

    private attachKeyboardEvent(): void {
        if (this.shiftKey) {
            this.shiftKey.destroy()
        }
        this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
    }

    private attachTransferEvent(): void {
        // 데이터 송수신 인스턴스 이벤트 할당
        this.transfer
        .on('receive-map-side', (side: number): void => {
            this.mapData.modifySide(side)
            this.isometric.setWorldSize(this.mapData.side)
        })
        .on('receive-selection-type', (type: number): void => {
            this.setSelectionType(type)
            this.setDisposeBrush(this.disposeBrush)
            this.updateDisposeCursor()
        })
        .on('receive-dispose-brush', (brush: Types.PaletteImage|Types.PaletteSprite|null): void => {
            this.setDisposeBrush(brush)
            this.updateDisposeCursor()
        })
        .on('receive-delete-selection', (): void => {
            this.deleteSelectionObjects()
        })
        .on('receive-properties', (properties: Types.PaletteProperties): void => {
            this.setItemProperties(properties)
        })
    }

    preload(): void {
        this.load.setBaseURL(this.assetDirectory)
        for (const { key, asset } of this.requireImages) {
            this.load.image(key, asset)
        }
        for (const { key, asset, frameWidth, frameHeight } of this.requireSprites) {
            this.load.spritesheet(key, asset, { frameWidth, frameHeight })
        }
    }

    create(): void {
        this.generateMapData().then((success: boolean): void => {
            if (!success) {
                return
            }

            // 맵 파일 감지 시작
            this.generateWatcher()
            this.generateAnimation()
            
            // 씬 기능 시작
            this.setCameraMoving()
            this.setSelectionType(0)
            this.setDisposeBrush(null)

            // 이벤트 할당
            this.attachMouseEvent()
            this.attachKeyboardEvent()
            this.attachTransferEvent()

            // 플러그인 설정
            this.isometric.setWorldSize(this.mapData.side)
            this.cursor.enableCoordinate(true)
            this.select.enable(false)

            this.select.events.on('drag-end', this.selectObjects.bind(this))
        })
    
        this.events.once(Phaser.Scenes.Events.DESTROY, this.onDestroy.bind(this))
    }

    update(time: number, delta: number): void {
        this.updateCamera(delta)
    }

    private onDestroy(): void {
        this.destroyCamera()
        this.destroyWatcher()
    }
}