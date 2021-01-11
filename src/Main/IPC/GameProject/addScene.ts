import path from 'path'
import fs from 'fs-extra'
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { handler as makeDirectory } from '../FileSystem/makeDirectory'
import { handler as writeFile } from '../FileSystem/writeFile'
import {
    PROJECT_SRC_DIRECTORY_NAME,
    PROJECT_SRC_ACTORLIST_NAME,
    PROJECT_SRC_ANIMSLIST_NAME,
    PROJECT_SRC_ASSETLIST_NAME,
    PROJECT_SRC_SKILLLIST_NAME,
    PROJECT_SRC_SCENE_DIRECTORY_NAME,
    PROJECT_SRC_SCENE_SCRIPT_DIRECTORY_NAME,
    PROJECT_SRC_SCENE_MAP_DIRECTORY_NAME
} from '@/Const'

import { parseProperty } from '@/Utils/parseProperty'
import RAW_BASE_SCENE from 'raw-loader!@/Template/Scene/BASE_SCENE.txt'
import RAW_SCENE from 'raw-loader!@/Template/Scene/SCENE.txt'

function getSceneKey(key: string): string {
    const chars: string[] = key.split('')
    if (chars[0]) {
        chars[0] = chars[0].toUpperCase()
    }
    return chars.join('')
}

async function ensureDirectory(projectDirPath: string, key: string): Promise<Engine.FileSystem.MakeDirectorySuccess|Engine.FileSystem.MakeDirectoryFail> {
    const sceneRootPath: string = path.join(projectDirPath, PROJECT_SRC_DIRECTORY_NAME, PROJECT_SRC_SCENE_DIRECTORY_NAME)
    const sceneDirPath: string = path.join(sceneRootPath, getSceneKey(key))
    const dirs: string[] = [
        sceneRootPath,
        path.join(sceneDirPath, PROJECT_SRC_SCENE_SCRIPT_DIRECTORY_NAME),
        path.join(sceneDirPath, PROJECT_SRC_SCENE_MAP_DIRECTORY_NAME)
    ]

    for (const dir of dirs) {
        const directoryMake = await makeDirectory(dir)
        if (!directoryMake.success) {
            return directoryMake
        }
    }

    return {
        success: true,
        name: '씬 디렉토리 생성 성공',
        message: '씬 디렉토리 생성에 성공했습니다',
        path: sceneDirPath
    }
}

interface FileWriteQueue {
    path: string
    content: string
}

async function ensureFile(projectDirPath: string, key: string): Promise<Engine.FileSystem.WriteFileSuccess|Engine.FileSystem.WriteFileFail> {
    const KEY: string = getSceneKey(key)
    const sceneRootPath: string = path.join(projectDirPath, PROJECT_SRC_DIRECTORY_NAME, PROJECT_SRC_SCENE_DIRECTORY_NAME)
    const sceneDirPath: string = path.join(sceneRootPath, KEY)
    const files: FileWriteQueue[] = [
        {
            path: path.join(sceneRootPath, 'BaseScene.ts'),
            content: RAW_BASE_SCENE
        },
        {
            path: path.join(sceneDirPath, 'Scene.ts'),
            content: parseProperty(RAW_SCENE, {
                PROJECT_SRC_ACTORLIST_NAME: path.parse(PROJECT_SRC_ACTORLIST_NAME).name,
                PROJECT_SRC_ANIMSLIST_NAME: path.parse(PROJECT_SRC_ANIMSLIST_NAME).name,
                PROJECT_SRC_ASSETLIST_NAME: path.parse(PROJECT_SRC_ASSETLIST_NAME).name,
                PROJECT_SRC_SKILLLIST_NAME: path.parse(PROJECT_SRC_SKILLLIST_NAME).name,
                PROJECT_SRC_SCENE_DIRECTORY_NAME,
                KEY
            })
        },
        {
            path: path.join(sceneDirPath, PROJECT_SRC_SCENE_MAP_DIRECTORY_NAME, 'Map.json'),
            content: JSON.stringify({ })
        }
    ]

    for (const { path, content } of files) {
        const fileWrite = await writeFile(path, content)
        if (!fileWrite.success) {
            return fileWrite
        }
    }

    return {
        success: true,
        name: '씬 파일 생성 성공',
        message: '씬 파일 생성에 성공했습니다',
        path: sceneDirPath
    }
}

export async function handler(projectDirPath: string, key: string): Promise<Engine.GameProject.AddSceneSuccess|Engine.GameProject.AddSceneFail> {

    const sceneDirectory: string = path.resolve(projectDirPath, PROJECT_SRC_DIRECTORY_NAME, PROJECT_SRC_SCENE_DIRECTORY_NAME, getSceneKey(key))
    if (fs.existsSync(sceneDirectory)) {
        return {
            success: false,
            name: '씬 생성 실패',
            message: '이미 동일한 키를 가진 씬이 존재합니다.'
        }
    }
    
    const directoryEnsure = await ensureDirectory(projectDirPath, key)
    if (!directoryEnsure.success) {
        return directoryEnsure as Engine.GameProject.AddSceneFail
    }

    const fileEnsure = await ensureFile(projectDirPath, key)
    if (!fileEnsure.success) {
        return fileEnsure as Engine.GameProject.AddSceneFail
    }

    return {
        success: true,
        name: '씬 생성 성공',
        message: '씬 생성에 성공했습니다',
        path: directoryEnsure.path
    }
}

export function ipc(): void {
    ipcMain.handle('add-scene', async (e: IpcMainInvokeEvent, projectDirPath: string, key: string): Promise<Engine.GameProject.AddSceneSuccess|Engine.GameProject.AddSceneFail> => {
        return await handler(projectDirPath, key)
    })
}