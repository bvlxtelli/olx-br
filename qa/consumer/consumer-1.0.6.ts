/**
 * Consumer written against the public API of the published package (olx-br@1.0.6).
 *
 * It is compiled against the declaration file of the branch, so it proves that a code
 * written for the published version still compiles. Nothing new is used here on purpose.
 */
import Olx = require('olx-br');

const olx = new Olx('client-id', 'client-secret', 'https://example.com/callback');

async function main(): Promise<void> {
    const url: string = olx.getAuthUrl();
    const urlWithoutAutoupload: string = olx.getAuthUrl(false);
    const urlWithState: string = olx.getAuthUrl(true, 'my-state');

    const token: string = await olx.getToken('code');

    const anuncios: any[] = await Olx.getAnuncios(token);
    const info: Olx.UserInfo = await Olx.getBasicUserInfo(token);
    const imported: any = await Olx.putAnuncios(token, [{ subject: 'x' }]);
    const deleted: any = await Olx.deleteAnuncios(token, ['ad-1']);
    const status: any = await Olx.getStatusAnuncio(token, 'ad-token');
    const carros: Olx.ModelosResponse = await Olx.getModelosCarros(token);
    const carrosComMarca: Olx.ModelosResponse = await Olx.getModelosCarros(token, 1);
    const carrosComModelo: Olx.ModelosResponse = await Olx.getModelosCarros(token, 1, 2);
    const motos: Olx.ModelosResponse = await Olx.getModelosMotos(token);
    const motosComMarca: Olx.ModelosResponse = await Olx.getModelosMotos(token, 1);
    const cilindradas: Olx.ModelosResponse = await Olx.getCilindradas(token);

    console.log(url, urlWithoutAutoupload, urlWithState);
    console.log(anuncios, info, imported, deleted, status);
    console.log(carros, carrosComMarca, carrosComModelo, motos, motosComMarca, cilindradas);
}

main().catch(() => undefined);
