import path from 'path'
import normalize from 'normalize-path'
import glob from 'fast-glob'
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { handler as writeFile } from '../FileSystem/writeFile'
import { getEnumContentFromArray } from '@/Utils/getEnumContentFromArray'
import {
    PROJECT_ALLOW_ASSET_EXTENSIONS,
    PROJECT_SRC_DIRECTORY_NAME,
    PROJECT_SRC_ASSET_DIRECTORY_NAME,
    PROJECT_SRC_ASSETLIST_NAME
} from '@/Const'

export async function handler(projectDirPath: string): Promise<Engine.GameProject.GenerateAssetListSuccess|Engine.GameProject.GenerateAssetListFail> {
    const cwd: string       = normalize(path.resolve(projectDirPath, PROJECT_SRC_DIRECTORY_NAME, PROJECT_SRC_ASSET_DIRECTORY_NAME))
    const listPath: string  = normalize(path.resolve(projectDirPath, PROJECT_SRC_DIRECTORY_NAME, PROJECT_SRC_ASSETLIST_NAME))

    try {
        const extensions: string[] = PROJECT_ALLOW_ASSET_EXTENSIONS.map((extension: string): string => `**/*.${extension}`)

        const list: string[]            = await glob(extensions, { cwd, absolute: false })
        const jsonWrite                 = await writeFile(listPath, getEnumContentFromArray(list))
        if (!jsonWrite.success) {
            return jsonWrite as Engine.GameProject.GenerateAssetListFail
        }
    } catch(e) {
        const { name, message } = e as Error
        return {
            success: false,
            name,
            message
        }
    }

    return {
        success: true,
        name: '에셋 리스트 생성 성공',
        message: '에셋 리스트 생성에 성공했습니다',
        path: listPath
    }
}

export function ipc(): void {
    ipcMain.handle('generate-asset-list', async (e: IpcMainInvokeEvent, projectDirPath: string): Promise<Engine.GameProject.GenerateAssetListSuccess|Engine.GameProject.GenerateAssetListFail> => {
        return await handler(projectDirPath)
    })
}