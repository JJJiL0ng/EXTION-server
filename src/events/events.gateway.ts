import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*', // 실제 프로덕션 환경에서는 허용할 출처를 명시해야 합니다.
  },
})
export class EventsGateway {
  @WebSocketServer()
  server: Server;

  // 클라이언트 연결 시 실행되는 핸들러
  handleConnection(client: Socket, ...args: any[]) {
    console.log(`✅ 클라이언트 연결됨: ${client.id}`);
  }

  // 클라이언트 연결 종료 시 실행되는 핸들러
  handleDisconnect(client: Socket) {
    console.log(`❌ 클라이언트 연결 끊김: ${client.id}`);
  }

  // 'message' 이벤트를 구독하고, 수신된 메시지를 처리하는 핸들러
  @SubscribeMessage('message')
  handleMessage(
    @MessageBody() data: string,
    @ConnectedSocket() client: Socket,
  ): void {
    console.log(`📬 메시지 수신: ${data} (from: ${client.id})`);
    // 메시지를 보낸 클라이언트를 포함한 모든 클라이언트에게 'message' 이벤트로 데이터를 다시 보냅니다.
    this.server.emit('message', `서버가 응답합니다: ${data}`);
  }
}