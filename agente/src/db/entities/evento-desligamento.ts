import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'eventos_desligamento' })
export class EventoDesligamento {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  matricula!: string;

  @Column({ type: 'date' })
  data_desligamento!: string; // YYYY-MM-DD

  @Column({ type: 'date', nullable: true })
  data_comunicado!: string | null;

  @Column({ type: 'tinyint', width: 1 })
  comunicado_ok!: boolean;
}